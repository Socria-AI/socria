# Artifact reliability (Logos 5)

November 5, 2026. The owner's report: "Since launch, Logos 5 has been failing to generate even simple artifacts." This document records what was wrong, what changed, how a failed generation now recovers, and how each part is tested.

## What was wrong

### 1. Every request was written for models the router no longer sends it to

The router (`lib/model-router.ts`) sends signed-in turns to GPT-6 Luna (free) and GPT-6.1 Terra or Sol (Socria One), with GPT-5.6 models below them on each ladder. These are **reasoning models**. On Chat Completions:

- they refuse `max_tokens`: "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.";
- they refuse any `temperature` except 1, unless reasoning is switched off (effort "none", which GPT-6 Luna and GPT-6.1 Terra have and GPT-6.1 Sol does not);
- they count their reasoning tokens against `max_completion_tokens`, so a cap sized for the answer alone, at the default effort (medium), comes back empty or cut.

Every model call in the app sent `max_tokens` and a fixed `temperature`. That covered the map pass, the display draft, the reply, experiences, the easy view, explore, read, write and both syntheses. So **every call to a routed model was refused**. Nothing named in the routing table ever ran.

### 2. The refusal was read as "this model is not available"

Each route decided whether to step down its ladder with `/model|not found|does not exist|unknown/` on the error message. The refusal says "…not supported with **this model**", so a refused parameter looked like a missing model.

- **The reply and the map pass** walked the whole ladder past every refused rung. On the free plan they were answered by GPT-4o mini, after two refused calls. On Socria One they were answered by GPT-4o, after three. Free-plan displays were therefore drafted by the weakest model on the ladder.
- **The easy view, experiences, explore, read, write, the docs page and both syntheses** stepped down one rung only (`ladder[1]`). That rung was another GPT-5.6 reasoning model, refused the same way, so they failed for **every signed-in person**. The answers were 500 or 502: "That photo could not be read just now", "Socria could not answer just now".

Before routing (November 3), the same calls failed on GPT-5.6 too, but every route's fallback was GPT-4o, which answered. Routing replaced that fallback with a same-family model.

### 3. An artifact asked for in words waited for the whole map

A display ("make me a checklist", "a comparison table of …") was drafted only after the map extraction, which is the largest prompt Socria sends. When the extraction came back empty, cut off, unreadable, or not at all, the route returned the old map with no `display`. The page said nothing (`refreshMap` ignored any non-200 response), so the artifact simply did not appear.

### 4. One bad draft was the end of it

A draft that its kind could not hold was answered "nothing was added", with no second attempt. That covered drafts that were not JSON, the wrong kind, a state outside the kind's rules, or cut off. An inline element in a slightly wrong shape was dropped from the reply without a word: the chart's type written as `"type": "bar"`, `labels` for `x`, numbers as strings, a comparison with a header column, or the options written as objects.

### 5. A simple comparison read wrongly from its own words

"Compare TCP and UDP side by side" was made straight from the words, with no model asked, and came out wrong: a comparison of "TCP" and "UDP side" on one criterion, "Side". The reader took the "by" in "side by side" as the start of the criteria. This was found in the browser while verifying the fixes above. Words that say how the comparison should look ("side by side", "in a table", "as a matrix") are now removed before the request is read (`lib/objects/display-words.ts`, `PRESENTATION`). With no criteria named, such a request now goes to the drafting pass, which fills a real comparison.

### Why the tests missed it

Every test stood in for OpenAI with a fake that accepted any parameters. Nothing held a call to the contract the real API keeps. The health check (`/api/health/upstream`) asks only whether each model id exists (`models.retrieve`), which it does.

## What changed

| Fix | Where |
|---|---|
| **Every request shaped for the model it goes to.** A classic model (GPT-4o, GPT-4o mini, GPT-4.1) gets the call as written. A reasoning model gets `max_completion_tokens`, with room for its reasoning on top of the route's own cap. Reasoning is switched off ("none") where the model has that setting (Luna, Terra), so the answer streams at once and a temperature still holds. Elsewhere it runs at "low" (Sol, the GPT-5.6 models), and sampling settings are dropped. | `lib/model-params.ts` (`traitsOf`, `shapeRequest`, `effortFor`, `REASONING_ROOM`) |
| **One place for every call.** Every OpenAI client in the app is wrapped by `tracked()`, so shaping there fixes every route at once, including ones not listed here. A parameter refused anyway is answered on the **same model**, with the call asked again without it or with it renamed, up to four times. Each adaptation is logged. | `lib/openai-usage.ts`, `lib/model-params.ts` (`adaptRefused`) |
| **A step down only when the model is the problem.** Failures are classified: the model itself (404, not enabled, withdrawn), a parameter, a passing fault (a rate limit or 5xx the SDK's own retries did not clear, a dropped connection), or anything else. Anything else covers a prompt too long, a policy refusal or the account's credit spent. A step down happens for the model or a passing fault, never above the tier. Every route now walks the whole ladder (`firstAccepted`). Routes that send an image also step down for a model that cannot read one. | `lib/model-params.ts` (`failureOf`, `cannotSee`), `lib/model-router.ts` (`refusedModel`, `firstAccepted`), the aux routes |
| **The display is drafted beside the map.** A display named in words, and not made from the map, is drafted as soon as the extraction has been asked, from the conversation alone. It is made whatever becomes of the map: empty, unreadable, refused, every rung failing, or the route itself throwing. A display read only by the extractor, or made from the map, is still made after the extraction, from what it found. | `app/api/logos/map/route.ts` (`startEarly`, `settleDisplay`, `withoutMap`) |
| **A draft that does not hold is repaired once.** It is sent back with what was wrong: not JSON, no display, a kind that does not exist, the wrong kind, a state that does not follow the kind's rules, or cut off. A cut-off draft gets twice the room. The repair is checked the same way. An honest decline ("there is not enough here") stands, and is never argued with. When the repair still does not hold, the first draft's fault is said in a sentence and nothing is added. Drafts are read leniently: a fence, a sentence around the JSON, a trailing comma. | `lib/objects/display-propose.ts` (`repairFor`, `parseDraft`) |
| **Experiences and the easy view are asked once more** when nothing usable comes back. What comes back is vetted the same way, and nothing is made up in its place. | `app/api/logos/experience`, `app/api/logos/easy` |
| **Inline elements: near misses are read as what they meant.** This covers the chart's kind as the element's type, `labels`, `categories` or `data` for `x` and `series`, numbers written as strings ("1,200", "$5", "12%"), a comparison's options as `columns` or `items`, a header column, rows as arrays, options as objects with a field per point (pivoted into rows), and a fence called `socria-ui`. Each is rewritten into the grammar and then held to exactly the same sanitizer and checks: the numbers must still be theirs or a source's. A block that is not an element at all is still left out, never shown as braces. | `lib/inline-ui.ts` (`normalizeInline`, `UI_LANGS`) |
| **A comparison read from its words reads its words.** "Side by side", "in a table" and "as a matrix" are removed before the options and criteria are read. | `lib/objects/display-words.ts` |
| **The page says so.** When a turn asked for something to be made and the pass that makes it failed outright (a 5xx, the platform's time limit, no answer), the note beside the map says it could not be made just now. | `components/LogosApp.tsx` (`MAKE_FAILED`) |

### Effort and cost

| Tier | Model | Effort | Temperature | Cap |
|---|---|---|---|---|
| Guest | GPT-4o mini | — | as written | `max_tokens` as written |
| Free | GPT-6 Luna | none | as written | `max_completion_tokens` = the route's cap |
| One, standard | GPT-6.1 Terra | none | as written | the route's cap |
| One, deep | GPT-6.1 Sol | low | dropped | the route's cap + 3,072 |
| A GPT-5.6 rung | GPT-5.6 Luna, Terra or Sol | low | dropped | the route's cap + 3,072 |

The cap is a ceiling, not a charge: room that goes unused costs nothing. Free turns now run on Luna, which is cheaper than GPT-4o mini, and Socria One's standard turns run on Terra, which is cheaper than GPT-4o (prices in `lib/model-router.ts`). So the fix lowers the spend per turn and removes two or three refused calls from every signed-in request.

### Switches (environment, read at call time)

| Variable | Effect |
|---|---|
| `OPENAI_REASONING_EFFORT` | The effort for every reasoning call, for example `low` if "none" is ever refused everywhere, or `medium` for more thought at more cost and latency. The room grows with it. "none" on a model without that setting becomes "low". |
| `LOGOS_ROUTER=off`, `OPENAI_MODEL_<TIER>_<LEVEL>` | As before (`docs/MODEL-ROUTING.md`). Every call is shaped whatever model it goes to. |

## How it is tested

- **A stand-in OpenAI that keeps the real contract** (`test/helpers/fake-openai-contract.mjs`): each model's family, efforts and refusals, reasoning tokens counted against the cap, and errors shaped as the SDK throws them. It can mark a model unavailable, keep calls in flight to show two passes running together, and be made stricter than what is known (for example, Luna refusing "none").
- **`test/model-params.test.mjs` (56):**
  - every route's call as written is refused by all six reasoning models, the refusal names "this model", the old step-down predicate read it as a missing model, and the new one does not;
  - the shaped call is accepted by every model, with the whole of the old cap left for the answer;
  - effort and room per model, including the environment switch;
  - every adaptation, and the failure classes;
  - the wrapper end to end: one call per model, a refused "none" answered on the same model, a streamed Sol reply.
- **`test/artifact-reliability-e2e.test.mjs` (83), through the real routes:**
  - guest, free and One each make a chart, a comparison table, a flowchart, a Venn diagram, a checklist, a study plan and a custom tracker on the tier's own model, nothing refused;
  - the display is drafted while the extraction is still out;
  - a map that fails four ways still leaves the display made;
  - a draft repaired from five kinds of fault; a repair that still fails, and an honest decline, are said and add nothing;
  - an unavailable model steps down, shaped; a refused "none" is asked again on the same model; a higher effort keeps the answer's room; One never steps to a free model;
  - inline elements on every tier, near misses drawn, a broken element left out with the words around it kept, and a deep turn on Sol streaming;
  - experiences and the easy view on every signed-in tier, with their retry;
  - the page's failure note.
- **Mutation checks**, each fix taken out in turn:
  - shaping: 43 failures;
  - the beside-the-map draft: the overlap check fails;
  - the repair: 8 failures;
  - the near-miss reading: 3 failures.
- **In the browser:** `scripts/dev/fake-openai.mjs` with `FAKE_OPENAI_CONTRACT=1` holds the dev stand-in to the same contract. The stand-in now also drafts every display kind, not only custom ones. Run with `OPENAI_MODEL_GUEST_STANDARD=gpt-6-luna` (and `_LIGHT`, `_DEEP`), and a guest's every call goes to Luna under it. Driven through the real app, typing in the composer, at 1440 px and on a 390 px phone:
  - all seven artifacts were made by Luna and drawn in Artifacts, inside their cards;
  - a comparison, a chart and a diagram were drawn inline in the conversation;
  - the stand-in refused no call the app made, and the page had no errors.
- **The comparison reader:** `test/visual-foundation.test.mjs` covers "side by side", "side-by-side", criteria after it, and "in a table" after the criteria. Taking the fix out fails three checks.
- **Against the real API:** `OPENAI_API_KEY=… node scripts/smoke-artifacts-live.mjs [--tiers free,one]` runs the same seven requests through the real map route, reporting what was made, which model answered, any adaptation, and the time taken. It has not been run: no key or network to OpenAI was available where this was built. It is the check that the contract held to here is the one the real API keeps.

## Limits

- The parameter contract comes from OpenAI's model pages and bug reports about these models, read through search results, because developers.openai.com could not be fetched from the build machine. If a model's real contract differs, the wrapper adapts on the same model and logs it, rather than failing or stepping down. `scripts/smoke-artifacts-live.mjs` is the confirmation.
- The quality of what a model drafts is only as good as the model. What is guaranteed is that the model the tier was promised is the one asked, that its draft is checked by the kind, repaired once, and said when it cannot be made, and that nothing is substituted for it.
- The map, chat, experience and easy routes set no `maxDuration`. On a Vercel project without Fluid compute, the default limit (10 to 15 s) would cut a long map pass short. The page now says so when that happens, but the setting itself should be checked in the project.
