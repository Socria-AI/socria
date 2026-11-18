# SocriaUX on GPT-6.1 Sol

**Branch:** `dev` · **Applies to:** `/ux-v0` (Starting Fresh) · **Status:** experimental, off by default.

GPT-6.1 Sol (`gpt-6.1-sol`) can run every SocriaUX model call: the questions, the Living Brief, the moodboard's other directions, the art directions, generation, targeted refinement and critique. It goes through OpenAI's **Responses API** with the official SDK, at reasoning effort **high**, with **structured outputs** where an answer has a fixed shape. Nothing else in Socria changes.

## Turning it on, comparing, turning it off

Server-side environment variables (never `NEXT_PUBLIC_`; no request can name a model, an API or an effort):

| Variable | Values | Default |
|---|---|---|
| `SOCRIAUX_MODEL` | any model id; `gpt-6.1-sol` for Sol | `gpt-6-luna` (as before) |
| `SOCRIAUX_EFFORT` | `none` `low` `medium` `high` `xhigh` `max` | `high` for Sol; the model's own otherwise |
| `SOCRIAUX_API` | `chat` `responses` | `responses` for Sol; `chat` otherwise |

- **On:** `SOCRIAUX_MODEL=gpt-6.1-sol`.
- **Compare:** add `SOCRIAUX_EFFORT=medium`.
- **Off:** unset `SOCRIAUX_MODEL`. SocriaUX goes back to GPT-6 Luna on Chat Completions, exactly as it was (tested).

It uses `OPENAI_API_KEY`, as the rest of the app does.

## How it is wired

The integration goes through the provider layer the whole app already uses. A Sol call is shaped, metered, retried, logged and priced like every other call.

| Piece | What changed |
|---|---|
| `lib/model-params.ts` | `shapeResponsesRequest` gives a Responses call the same treatment a Chat call gets. The cap is written for the answer, and the reasoning gets its room on top (`max_output_tokens`). The effort becomes `reasoning.effort`. A temperature is dropped for a model that refuses one (Sol always does). `adaptRefusedResponses` answers a refused setting on the same model: a strict schema it doesn't take becomes plain JSON, and an effort it hasn't got is eased. |
| `lib/openai-usage.ts` | `tracked()` now wraps `client.responses.create` as well as chat completions, buffered and streamed. Every call is shaped, held against a free account's week of tokens and settled at its real cost, adapted when a setting is refused, and logged in the usual `[tokens]` line, reasoning included. |
| `lib/token-allowance.ts` | The input estimate reads the Responses API's shape: `instructions`, input messages and `input_image` parts. |
| `lib/ux-v0/model.ts` | The three switches above, and `socriauxSetup()` for the logs. |
| `lib/ux-v0/schemas.ts` (new) | Strict JSON schemas for the art directions, the brief and its revision, the moodboard's other direction, and the critique. Each matches its prompt field for field, and a field the prompt calls optional is `null` when there's nothing to say. The schemas also constrain values: a direction can only name catalogue languages and allowlisted fonts, and a verdict can only be one of the four. |
| `lib/ux-v0/ask.ts` | The Responses branch. It sends `instructions` and `input` (images as `input_image`), `reasoning.effort`, `text.format`, and `store: false`, so a designer's work is not kept on OpenAI's side for later retrieval. It reports when an answer was cut short (`max_output_tokens`) or refused. The Chat branch is unchanged. |
| Routes | `direct`, `brief`, `discover` and `critique` pass their schema. Their failure paths are unchanged. |

**Kept on plain JSON, on purpose:**
- **Discovery:** its `known` field is a map with open keys, which strict mode cannot express.
- **Generation and refinement:** a section's content depends on its kind, and is already validated field by field in `lib/ux-v0/spec.ts`.

**If Sol is unavailable:**
- **The app:** the router's ladder answers, still on the Responses API: GPT-5.6 Sol, then GPT-6.1 Terra, then GPT-4o (sent without a reasoning setting).
- **The evaluation:** has no ladder unless `--fallback` is given, so a result reported as Sol is Sol.

**A structured answer that runs on.** Now and then, a strict-schema answer never closes: it writes whitespace until it hits its cap, with little reasoning. `askJson` then asks once more, on the same model, in plain JSON mode, and both calls are billed.

**Not applicable here.** SocriaUX's calls are one buffered JSON answer each, with no tools. The wrapper still handles a streamed Responses call (its usage is read from `response.completed`).

**Images.** Sol is not used to make images, and none are generated. The moodboard's pictures still come from the licensed libraries (Openverse and the others) and the designer's own uploads, as before.

## Cost

Sol is priced at $2 per million input tokens and $10 per million output ($0.10 cached), against GPT-6 Luna's $0.10 and $0.50. Reasoning is billed as output, and at high effort each call may reason for up to 16,384 tokens beyond its answer cap. Each call's cost appears in SocriaUX's header, and in `ux_v0_usage`. The daily caps (`SOCRIAUX_DAILY_CALLS`, `SOCRIAUX_DAILY_GENERATIONS`) still apply.

SocriaUX uses one model whatever the person's plan, so turning Sol on puts free accounts on Sol too. Their weekly token allowance still limits them. Whether Sol should be for Socria One members only is a product decision this change does not make.

## The creative-quality test

`test/browser/ux-v0/sol-eval.mjs` walks the whole Starting Fresh flow with the app's own prompts, parsers, renderer and checks. It runs the six dogfood projects (`dogfood-projects.mjs`) on Sol at high and at medium, and with `--baseline` on GPT-6 Luna as SocriaUX runs today. The steps:

1. Questions, answered from the project's own brief.
2. The Living Brief, from a moodboard with notes and a reference to steer away from.
3. Another direction for the moodboard.
4. Three art directions.
5. Generation: drawn at 1280 and 390 px, measured in the page, and given the workspace's two rounds of fixes.
6. A targeted refinement of the main headline.
7. A critique of the primary button, with a crop of it.

For each step it records:

- **Every call:** whether the answer parsed, the time, the tokens and cost, and whether it was cut or refused.
- **The questions and the brief:** questions with options; how much of the project's own audience and objective the brief keeps; whether the moodboard's notes reached the brief.
- **The directions:** generic direction names.
- **The page:** quality, distinctiveness and fidelity scores, stock phrases, placeholders and the fixes needed.
- **The refinement and the critique:** whether the refinement touched only its section, and whether the critique cited evidence.

It doesn't score taste: the screenshots are for a person.

```bash
node test/browser/ux-v0/sol-eval.mjs --dry-run
```

The dry run uses the strict fake: no network and no cost. It checks the plumbing, not Sol.

```bash
node test/browser/ux-v0/sol-eval.mjs --yes --baseline --max-usd=15
```

The live run spends real money. It prints the worst case first (US$14.48 for all six projects × three setups, if every call wrote its whole cap) and stops past `--max-usd`. Use `--projects=socria-promo,portfolio` and `--efforts=high` to test less.

## What was tested here

This environment cannot reach `api.openai.com`: its network policy refuses the host, and there is no key. So everything below was run against scripted Responses-API answers. None of it measures Sol's quality.

- **`test/model-params.test.mjs` (74 passed):**
  - Responses shaping for Sol at high and at default effort, Luna, and GPT-4o.
  - A refused schema eased to JSON on the same model.
  - Usage logged with reasoning tokens.
  - Free-plan metering held and settled.
  - A streamed call's usage.
- **`test/ux-v0.test.mjs` (345 passed):**
  - The three switches.
  - Every schema accepted as strict by the fake.
  - Each schema-shaped answer, nulls included, read by the real parsers.
  - `askJson` end to end: request shape, effort, cap, `store: false`, pricing, the ladder down to GPT-4o, a refused schema, a cut answer, a refusal, an image, and Luna unchanged.
- **`test/ux-v0-route.test.mjs` (87 passed):** all seven Starting Fresh steps through the real routes on Sol. Each is one Responses call at high effort with the right format, priced at Sol's rates and recorded. Also: medium on request, the ladder when Sol is refused, and Luna again when unset.
- **`sol-eval.mjs --dry-run --baseline`:** 126 calls across six projects and three setups, all parsed, with 18 pages drawn and measured. The plumbing works. The numbers are the fake's.

## Live results (18 November 2026)

**What was run.**
- Six projects, three setups, seven steps each.
- 124 live calls against the real OpenAI API. Every call was served by the model it was asked of: no fallback.
- **Cost:** US$1.09 for the full run. The smoke run, the experiments and the two crashed partial runs cost about US$0.70 more.

| | Sol, high | Sol, medium | GPT-6 Luna (today) |
|---|---|---|---|
| Calls parsed | 41/41 | 40/41 | 42/42 |
| Cut at the cap (runaway) | 0 in this run, 3 in earlier runs | 1 (critique) | 0 |
| Median seconds: questions / brief / art direction / generation / critique | 27 / 45 / 60 / 70 / 40 | 12 / 27 / 32 / 33 / 18 | 3 / 7 / 8 / 8 / 4 |
| Model time per project | about 4 minutes | about 2.5 minutes | about 35 seconds |
| Cost per project (seven calls) | US$0.100 | US$0.079 | US$0.002 |
| Pages generated | 6/6 | 6/6 | 6/6 |
| Quality / distinctiveness / fidelity | 95.0 / 95.3 / 100 | 97.7 / 96.5 / 100 | 98.8 / 91.5 / 100 |
| Stock phrases | 0 | 0 | 0 |
| `[placeholders]` left on the pages | 62 | 45 | 30 |
| Questions per project | 0.8 | 1.0 | 1.3 |
| Moodboard notes reaching the brief (of 3) | 3 | 3 | 3 |
| Generic direction names | 0/18 | 0/18 | 0/18 |
| Refinements touching only their section | 6/6 | 6/6 | 6/6 |

**What the numbers and the pages say:**
- **Reliability.** Every step works on Sol through the Responses API. Strict structured outputs are not reliable on their own: in about 60 strict-schema calls across all the runs, 4 ran away to their cap (the moodboard direction twice before its schema was narrowed, the critique twice). In about 70 plain-JSON calls, none did. `askJson` now recovers a cut structured answer by asking again in JSON mode. The research and portfolio re-runs loaded the code from before that change, so the medium critique above is the unrecovered failure.
- **Speed is the cost of Sol, more than money.** At high effort, the art direction takes about a minute and a generation about 70 seconds. The whole flow is roughly seven times Luna's model time at high, four times at medium. At about US$0.10 per project, Sol costs roughly 50 times Luna.
- **Differences in the work are modest and mixed:**
  - **Distinctiveness:** Sol scored higher (95–96 against 91.5).
  - **Generic defaults:** Sol never fell back to the Fraunces-with-Inter pairing, a generic default; Luna did twice.
  - **Wording:** Sol's direction names and concepts were more specific ("Room to Reason", "Before the Answer").
  - **Quality score:** Luna's was slightly higher.
  - **Placeholders:** Sol left about twice as many. It is more careful not to invent facts, but its pages and app screens read as unfinished: the finance interface is mostly `[Month YYYY]` and `[Owner name]`.
  - **Interpretation:** Sol read the Socria One announcement as an in-product screen; Luna made a page.
  - **Looking at the pages:** the 18 pages side by side show no clear visual winner. The direction engine and renderer set most of what is seen, whichever model writes the words. Sol's weakest page was the portfolio at high effort (a name-only hero, then placeholders).
- **High against medium.** Medium was as good on every measure here, at about 60% of high's time and 80% of its cost.

**Limits of this test.**
- Every project had the same moodboard (warm café light), and the designer's intent was the project's name and objective only. Most pages are therefore warm and brown, and the dance company's own "dark stage" direction never reached the model.
- Each case ran once, so differences of a few points are within noise.
- Taste is not scored.

The full results are in `sol-eval.json` and screenshots written by the harness. Run it again with `--projects` and `--efforts` to look closer.
