# Accuracy, uncertainty and pushback

How Core 4 and Logos 3.5 decide what they know, check what they compute, and
answer someone who says "are you sure?". Code: `lib/accuracy/`. Tests:
`test/accuracy*.test.mjs`. Live eval: `evals/accuracy/`.

## The failure, and its root cause

Asked for d/dx[csc(x)], a reply said csc(x)cot(x) (the minus sign gone) with
full confidence. Challenged about whether the quotient rule applied, it agreed
with the challenge instead of re-deriving, and never said that the chain rule
and the quotient rule are both valid and give the same result.

Both faults have one root: **nothing in the chat pipeline computed anything.**
The symbolic engine (`lib/model/expr.ts`) has had csc′ = −csc·cot right all
along, but only the graphs used it. The chat did calculus from the reply
model's memory. Verify Mode checked arithmetic exactly and sent everything
else to a cheaper model. Pushback about a *claim* ("isn't it positive?") was
not recognised at all: Core 4's signals noticed only "that's not what I meant".
So a challenged answer was settled by whoever spoke last.

A second, latent defect surfaced while building the fix: `expr.parse` never
called its own `implicitMul`, so `2x` and `csc(x)cot(x)` (which the evaluator
has always read as products) failed to parse in the symbolic engine. Fixed in
`lib/model/expr.ts`. All existing suites pass with it.

## What happens on a turn now

Both chat routes run the same deterministic plan (`planTurn`,
`lib/accuracy/accuracy.ts`). It makes **no model calls**.

1. **Before the reply.** The plan:
   - computes what they asked: a derivative (symbolic), a definite integral
     (quadrature), a limit (numerical approach), an equation's real roots, or
     whether an identity holds;
   - for a derivative with reciprocal trig in it, also derives the result by
     the quotient rule and by the chain rule, and checks that both equal the
     direct one;
   - checks the claims in **their** message;
   - when they **push back** (`lib/accuracy/pushback.ts`), re-checks the claims
     in the **previous reply**, and writes "how to answer" from the verdicts.
     Previous reply wrong: own it first, plainly, with the corrected result,
     and no invented reason. Previous reply right and theirs wrong: keep it,
     show where theirs slips, and don't concede. Both right: say so.
     Nothing checkable: re-examine on the merits and say what would settle it.

   The results go to the reply model as a block. In Core 4 that is the verify
   block; in Logos it is appended to the system prompt.

2. **Held or streamed.** The plan's `check` decides whether this turn is risky
   enough to read before it is sent: the turn involves mathematics, or pushes
   back on mathematics. Held turns are generated whole and checked. Every other
   turn streams exactly as before. On the scenario corpus
   (`evals/core4/scenarios`, 528 user turns) 13% of turns are held, almost all
   in the maths and learning sets.

3. **After the reply (held turns).** `checkDraft` reads every claim the draft
   makes and checks it. A wrong one becomes a specific retry note (what, why,
   and the correct result) for the **one** regeneration the pipeline already
   allows. In Core 4 that is the Answer Guard's retry; in Logos it is a single
   non-streamed call. **No extra model call happens unless a claim is
   refuted.**

4. **Last resort.** If the regeneration is still wrong, the reply ships with a
   plain correction after it ("Correction: d/dx[csc(x)] = −(csc(x)·cot(x)),
   not csc(x)·cot(x) as written above."), never with the error standing
   silently.

5. **Streamed turns.** If a finished streamed reply turns out to contain a
   refuted claim (rare, since nothing in the question was mathematical), the
   same correction follows it in the stream.

### When the answer is theirs to find

Core 4's withhold and the Logos Answer Guard both apply. Nothing computed
reaches the reply model; the block says only that the answer was computed and
is deliberately not shown. Retry notes and corrections name the **kind** of
slip ("a sign error", "a missing chain-rule factor") and never the value. A
draft that states the answer they are working out is sent back, unless they
wrote that answer themselves, in which case confirming it is not a leak.

### Verify Mode

Core 4's exact path now covers what the engine can decide: their derivative,
integral, limit or solution is checked by computing it, not by the cheaper
checker model's opinion. That removes a model call from those turns.

## What a verdict means

| verdict | meaning |
|---|---|
| **verified** | Computed, and the claim agrees. For an expression this means agreement at 19 fixed points (away from the poles of tan, sec, csc, cot, log and 1/x), across two settings of any parameter, to 7 significant figures. For the expressions a reply contains, two different analytic functions cannot agree at that many generic points by accident. It is still evidence, not a symbolic proof. |
| **refuted** | Computed, and the claim disagrees: a counterexample point, or the computed value. This is the strong direction. |
| **consistent** | A numerical scan found no counterexample. Used for domain and range claims, which a scan can refute but never prove. Shown to the reply model as "no counterexample found (a scan, not a proof)". |
| **unchecked** | The engine cannot decide it: unreadable notation, no convergence, nothing to compare. Never shown as either of the above. |

Conventions are fixed in one place each:

- Powers are real-valued (`lib/real-power.ts`): (−8)^(1/3) = −2, while
  (−8)^(1/2) is undefined.
- `sin 30°` means degrees.
- `i` and `j` are never read as real variables, and `≡ … mod n` is never read
  as an identity.

When a wrong derivative is caught, the checker says **how**, by computing the
derivative each common mistake would produce and comparing:

- the sign is wrong
- the chain-rule factor is missing (including inside `e^(2x)`)
- the quotient rule's numerator was added instead of subtracted
- the product rule was applied as f′g′
- it is the derivative of the neighbouring function (sec for csc)
- it is off by a constant factor or a constant

### Claims it reads

| kind | example | how it is decided |
|---|---|---|
| derivative (1st, 2nd) | `d/dx[csc x] = −csc x cot x`, `f′(x) = …`, "the derivative of … is …" | symbolic differentiation |
| antiderivative | `∫ sec²x dx = tan x + C` | differentiate it back |
| definite integral | `∫₀¹ x² dx = 1/3`, "the integral of x² from 0 to 3 is 9" | tanh–sinh and Gauss–Kronrod quadrature, which must agree |
| limit | `lim_{x→0} sin x / x = 1` | numerical approach from each side |
| identity / rewrite chain | `sin 2x = 2 sin x cos x`, `a = b = c` | evaluation |
| arithmetic | `17 × 23 = 391`, `√2 ≈ 1.414` | evaluation, within the stated precision |
| solutions | "so x = 2 or x = 3" | substitution, plus completeness on −1000…1000 when the reply says it lists them all |
| domain / range | "the domain of √(x−2) is [2, ∞)" | scan for a counterexample |
| units | "60 mph ≈ 26.8 m/s", "1 J = 1 N/m" | conversion through SI; dimension mismatch |

Extraction is deliberately conservative. A formula is a claim only when its
shape or its sentence says so: an operator on the left, a chain, an identity
called one, a reciprocal definition, a solution in a sentence that says it is
one. "If x = 0", "try x = 3", "x = 1 is extraneous", "set f′(x) = 0", and a
sentence that quotes an earlier mistake ("earlier I wrote … — that was
wrong") are never read as claims. Otherwise the checker would "correct" exactly
the reply that owns up.

## The prompt rules

`lib/accuracy/rules.ts` is included verbatim in both system prompts, so the
two surfaces cannot drift on what counts as known. Each keeps its own voice,
moves and Conversation Style. The rules:

- **Calibration.** Keep established, sourced, inferred and unknown apart.
  Report uncertainty when it is real, in plain words, once, and never as a
  percentage. Don't hedge what is settled.
- **Computed mathematics stands.** If the model's own working disagrees with a
  computed result, the working has the slip. Say "checked" only when a block
  says so.
- **Pushback.** Re-examine the exact claim. Wrong: own it first. Right: keep it.
  Both right: say so. It depends: say on what.
- **No invented sources.** No made-up citation, study, statistic, figure,
  quotation or link. Flag time-sensitive facts as possibly out of date.

Documents already had the matching rules (`lib/docs/render.ts` `DOC_RULES`):
keep what the document says, what was calculated from it, interpretation, and
what it does not say apart, and cite passages by key.

## Fabricated tool runs

The model runs nothing. The Answer Guard already stripped "I searched" and
"I ran the code". It now also strips claimed verifications ("I double-checked
the derivative", "this was verified numerically") on turns where nothing was
computed, and named tools ("I plugged it into Wolfram", "a quick check in
Python") always. Only first-person and passive claims are stripped, so "when
you plugged it into Desmos…" and "this can be verified numerically" are left
alone. The same filter (`fabricatedToolClaim`) runs on every path: the guard
on held Core 4 turns, the sentence gate on streamed Core 4 turns, and on Logos
both the held path and a filter-only sentence gate on the streamed one (which
changes nothing else about how Logos streams).

## What was verified, and how

- `test/accuracy.test.mjs` (184): notation; all six trig derivatives, right and
  sign-flipped, in LaTeX, Unicode and prose; reciprocal identities;
  chain-rule and quotient-rule equivalence; named mistakes; integrals, limits,
  units, solutions and domains; fractional powers of negative numbers;
  incorrect and correct user corrections; disputes nothing can compute;
  withhold; a 15-message false-positive corpus; and 9 real non-pushback
  messages from the scenario corpus.
- `test/accuracy-e2e.test.mjs` (37): through the real Core 4 and Logos routes,
  with the model scripted. A wrong draft is regenerated and never shown. A
  second wrong draft ships with a correction. Pushback is resisted or
  accepted per the verdicts. Ordinary turns get no block. A streamed error is
  corrected after it. "I ran it in Python" never streams. Verify Mode decides
  calculus with no checker call. Under the Logos Answer Guard nothing computed
  reaches the model and a leak is sent back.
- `test/accuracy-eval.test.mjs` (52): the live eval's grader, on canned right,
  wrong, hedged, capitulating and fabricating replies.
- **Real text:** the checker was run over every user turn in
  `evals/core4/scenarios` (528) and every reply in the stored style run (48).
  After fixes it refutes exactly two claims. Both are genuine mistakes in the
  person's work: a factorisation (λ−6)(λ−1) for λ²−7λ+10, and a missing
  chain-rule factor in d/dx[x³e^{2x}]. The first version of the checker also
  misread assignments and definitions as identities, and flagged six
  non-challenges as pushback. Those were fixed, and the messages are now
  regression tests.

**Not measured here:** this environment has no model API key, so no live
model has been run through the new pipeline. The suites above prove what the
pipeline does with a given draft, not how often a real model produces a wrong
one, hedges, or concedes. **No improvement in error rates is claimed.**

## Measuring it (live)

```
OPENAI_API_KEY=… node evals/accuracy/run.mjs              # both surfaces
OPENAI_API_KEY=… node evals/accuracy/run.mjs --root <checkout before the change>
```

33 scenarios in 18 groups covering every requested category (`evals/accuracy/scenarios.json`), each graded
deterministically. The summary reports:

- confidently-wrong replies
- any refuted claim
- wrong concessions under pushback
- missed acknowledgements of a real mistake
- hedging on settled questions
- missing uncertainty on unsettled ones
- fabricated tool claims
- unsourced specific citations

Each is reported as a count over the scenarios it applies to. Error rates and
over-hedging are measured together, because the goal is calibration, not
caution. A live model is sampled, so run each side more than once before
reading a difference of one or two scenarios.

## Limits

- **The grammar is closed.** One variable plus parameters. No vectors,
  matrices, multivariable calculus, complex numbers, sums, series,
  inequalities or proofs. Notation it cannot read is unchecked, never guessed.
- **No symbolic integration.** An antiderivative is checked by differentiating
  it back. A wrong one gets "its derivative is X", not the right antiderivative.
- **Numerical, not symbolic, equality.** "Verified" is agreement at many
  points (see above). Limits that diverge slowly (ln x at 0⁺) come back
  unchecked. Solution completeness is only checked on −1000…1000 and never
  for periodic equations.
- **Units:** a subset (SI plus common US and time units). Temperatures are not
  converted, because they are affine.
- **Extraction misses claims.** It prefers missing a claim to misreading one.
  A derivation in an unusual shape may go unchecked.
- **Non-mathematical claims are not fact-checked by computation.** History,
  science and business claims rely on the prompt rules, the web research
  block when one ran, its dangling-citation check, and the document citation
  rules. A specific citation without a source this turn is discouraged by the
  rules and measured by the eval, but not blocked.
- **Pushback detection is lexical,** and deliberately narrow. A challenge
  phrased unusually is answered by the prompt rules alone, without a re-check.
