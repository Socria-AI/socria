# SocriaUX: performance, latency and token efficiency

## Why

In a live demonstration to a prospective partner, SocriaUX felt slow, spent too many tokens and seemed broken at
times. This is what was found, what was changed, and what was measured before and after.

**What could and could not be examined.**
- **Production was out of reach.** Its logs and configuration could not be read: the deployment's account was not
  reachable from here, and there was no database access.
- **No provider was called.** Live calls cost money and were not authorised.
- **What the evidence rests on instead:**
  - the code itself;
  - the 124 live calls of 18 November 2026 (`test/browser/ux-v0/fx/sol-eval-calls.json`), with real latencies and
    token counts per stage;
  - a new offline benchmark, `test/browser/ux-v0/perf-bench.mjs`. It runs the real route handlers against a model
    that answers each stage after its measured time.

Every number here says which of these it comes from.

## A · Root causes

### Measured

1. **The premium model's time is most of the wait.**
   - On GPT-6.1 Sol at medium effort, the median generation took 31 s (45 s at most) and art direction 32 s.
   - At high effort, generation took 53 s at the median and up to 77 s.
   - 11 of the 124 live calls took more than 45 s. One runaway critique wrote 9,592 tokens over 140 s.
   - GPT-6 Luna answered every stage in 2–8 s.

2. **The documented way to use Sol was the slowest configuration.**
   - `.env.example` presented `SOCRIAUX_MODEL=gpt-6.1-sol` as the way to run on Sol. That legacy switch puts
     *every* stage on Sol, the questions included, at high effort.
   - From the per-stage medians, a new project's model time is then 207 s, against 77 s with routing.
   - Whether the demo deployment had it set could not be checked.

3. **There were no time limits.**
   - Only the generate route declared a `maxDuration` (60 s). The other five model routes ran on the platform's
     default.
   - The premium timeout (45 s) plus an economy fallback could run past 60 s.
   - Economy calls had no timeout at all: the OpenAI SDK's default is 10 minutes, with retries.
   - Measured before: a stalled provider meant **no answer within 25 s**, and the request kept hanging.

4. **Cancelling did not stop the model.** Measured before: a generation the designer abandoned ran to the end,
   and was billed.

5. **Duplicate actions made duplicate calls.**
   - Nothing stopped a second press. Measured before: 12 designers each double-pressing "Use this direction" made
     24 generations.
   - At the peak, 25 model calls were running at once.

6. **Round trips ran one after another around every call.**
   - Before each model call, the route checked, in turn: the rate limit, the daily caps, then the budgets, then the
     Socria plan and the allowance. After it, it waited on two usage writes, again one after the other.
   - Measured before, at 40 ms per database round trip: **1,083 ms of SocriaUX's own time per new project**
     (2,512 ms at 100 ms).

7. **Saves competed with model calls.**
   - The project's background save to the account (2.4 s after each change), the moodboard's image searches and
     every model call shared one rate-limit pool: 40 a minute.
   - Other Socria features' background passes drew on the same pool.
   - A busy session could be refused a model call because of its own saves.

8. **The generator's prompt could not be cached.**
   - It opened with the project, then the shared instructions.
   - Two different projects' generate prompts shared **58 tokens of about 3,300**. Providers cache only a long
     shared prefix, of at least 1,024 tokens.

9. **Reasoning had too much room.**
   - Each premium call could reason for up to 8,192 tokens above its answer's cap (16,384 at high).
   - The most any normal call used in the live run, answer included, was 1,919 (medium) and 3,355 (high).
   - The rest of that room only let a runaway run longer and cost more.

10. **Small edits went to a model.**
    - "Change the button colour to black", "Make the headline bigger", "Rounder corners", new words in quotes, a
      typeface: 5 of 6 such edits made a model call.
    - Measured before: 10,941 input tokens and about 17 s of model time for the six.

11. **Token reporting hid reasoning.**
    - Reasoning tokens were folded into "written" and never shown apart, though they are billed as output.
    - Cached tokens were kept, but not shown.

### Measured and ruled out

- **Large or repeated context.** Live inputs were 900–3,200 tokens per call, and no conversation history is
  resent.
  - A refinement sends a digest of the design, not the design, and comes back as one patch: the page is never
    regenerated for an edit.
  - The generate prompt has grown about 36% since November, with the newer design rules, to about 3,300 tokens.
- **Padding in the brief.** Dropping its empty fields would save 3–15% of a small field, about 15–40 tokens: not
  done.
- **Request size.** A busy moodboard adds about 30 KB per request, and only about 3 KB of it (the seen list) is
  unused by the prompts. Not worth changing.

## B · What changed

### `lib/ux-v0/stage-server.ts` (new): every model stage, run one way

The six model routes now share one runner. Each route builds its prompt and reads its answer; the runner does the
rest.

- **One operation, once.**
  - The browser names each action (`x-operation-id`). The same action arriving again gets the first one's answer:
    one model call, one charge.
  - An unnamed identical request counts as the same action while the first is still running.
  - Only a success is reused: a failure or a cancel is tried afresh.
- **Concurrency limits.**
  - At most `SOCRIAUX_USER_CONCURRENCY` operations per person (default 3).
  - Optionally `SOCRIAUX_MAX_CONCURRENT` per server instance, for a workshop.
  - Past either, a clear answer says when to try again.
- **Checks at once.** The daily caps, the budgets (person, project and organisation) and the Socria plan and
  allowance are read together.
- **A deadline.**
  - Every operation ends within `SOCRIAUX_ROUTE_BUDGET_MS` (55 s), inside an explicit 60 s `maxDuration` on every
    model route.
  - A premium call slower than 40 s, or than the economy model's reserved time allows, gives way to the economy
    model. That model is guaranteed its time: 15 s for generation, about 1.5 times its slowest measured call.
  - The designer always hears back from SocriaUX, never a platform timeout.
- **Streamed, honest progress.** Events stream to the browser as they happen:
  - accepted, checking, the model asked (which one, and its tier);
  - still thinking, with the time so far, after every 3 s of silence;
  - writing (characters so far), a fallback, finishing;
  - then the result.
  - Nothing is a percentage. A client that doesn't ask for the stream gets plain JSON, as before.
- **Cancel stops the model.** The request's abort closes the provider's stream, so generation stops.
- **Plain failures.** Each kind of failure has its own message:
  - a timeout: 504, nothing changed;
  - the provider's rate limit: 503, with when to try again;
  - an interrupted answer;
  - a cancel: 499.
  - An answer that does not hold together is refused, and the canvas keeps what it had.
- **One record per operation** (`lib/ux-v0/telemetry.ts`):
  - **ids:** operation and stage, model, API, tier and effort;
  - **tokens:** input (cached apart) and output (reasoning apart);
  - **cost;**
  - **times:** queued, time to first token, model time, total;
  - **outcome:** retries, how it ended, whether it was cancelled.
  - It is written to `ux_v0_calls`, logged as one `[ux-v0 op]` line with the person and project hashed, and sent
    back for the browser's diagnostics. It never holds a prompt or the designer's words.
- **Unusual use is flagged.** More than 60 operations or US$0.50 in ten minutes gives one `[ux-v0 unusual]` log
  line. It blocks nothing.

### The model call (`lib/ux-v0/ask.ts`, `lib/model-params.ts`)

- **Streaming:** calls stream on both APIs, with the time to first output measured.
- **Cancellation:** they take an abort signal and a deadline, and are never started too close to it.
- **Retries:** the SDK's own retries are off, so the ladder and the deadline decide.
- **Prompt cache key:** `prompt_cache_key` is sent, as the Logos chat route already does in production.
- **Reasoning room:** bounded to half the shared room (`SOCRIAUX_REASONING_ROOM`). The bound is read by the
  request shaper and never sent.

### Routing (`lib/ux-v0/model.ts`)

- **Legacy default effort.** The legacy one-model setting now defaults to **medium** for Sol. The live evaluation
  found medium as good as high on every measure, at about 60% of the time and 80% of the cost. `SOCRIAUX_EFFORT=high`
  still works.
- **Critique by complexity.** A critique is routed by what is asked, as refinement already was: a short question
  about a selected part goes to the economy model; the whole design, a long question or an image of a whole page
  goes to the premium one. `SOCRIAUX_TIER_CRITIQUE` overrides it.
- **Premium stays premium.** Art direction, generation and complex refinements stay on the premium model.

### Small edits in code (`lib/ux-v0/quick-edit.ts`, new)

These are read exactly and applied as one validated patch, in the browser first and in the refine route for any
other client. There is no model call and nothing is regenerated:
- a colour for the buttons and accent, the background or the text, by name or value;
- a typeface from SocriaUX's list, for the headlines or the text;
- the corners;
- new words in quotes, for the selected field or "the headline";
- the headline's size;
- more or less space around a selected section, or removing it.

How it behaves:
- **Asked first.** It asks before applying anything that changes what the designer locked, leaves their design
  system, or would make text hard to read (with the contrast said).
- **Already so.** An edit that is already true says so.
- **Not certain:** two changes at once, a part it cannot name, a feeling: these go to the model, as before.

### Prompts (`lib/ux-v0/design.ts`)

The generator's instructions now open with what every project of that kind of page shares: the role, the library,
the rules that always hold, the knowledge against generic pages and the voice. The project comes last. Nothing was
removed or reworded beyond the ordering.

### Budgets, limits and records

- **Organisation budgets** (`SOCRIAUX_ORG_DAILY_USD`, `SOCRIAUX_ORG_MONTHLY_USD`). The organisation comes from
  Clerk; each call is recorded with its organisation, and an organisation's spend is summed before every call.
- **Separate rate-limit pools.** SocriaUX's model calls have their own pool (`uxmodel`, 20 a minute); its saves,
  image searches and design-system reads have another (`uxsync`, 90 a minute).
- **Faster writes.** The two usage writes run at once rather than one after the other. On a streamed answer they run
  after the result has been sent, so the designer never waits for them.
- **Schema** (`supabase/schema.sql`):
  - **new columns:** telemetry and `org_id`;
  - **old schema:** a database without them keeps working, the row written without them;
  - **organisation budgets:** not held until `org_id` exists, and said once in the logs.

### The browser (`components/ux-v0/api.ts`, `Workspace.tsx`)

- **Requests.** Each asks for the streamed answer, names its action, can be cancelled, and stops waiting at 70 s.
- **Messages.** Failures say what happened: cancelled, timed out, offline, the server's own failure, a limit and
  when to retry.
- **One action at a time.** Each model action runs once: a second press while it runs does nothing.
- **The working strip** shows each running action:
  - what it is, and where it has got, as the server said;
  - the seconds so far;
  - a **Cancel** button.
- **The cost panel** shows the reasoning and cached shares, and a **Diagnostics** table of the last calls:
  - the stage and model (premium marked);
  - tokens, with cached and reasoning apart;
  - cost;
  - queue, first output, model, network and total time;
  - how it ended.
- **Budget warning.** Before a premium generation that a nearly spent budget might not hold, the designer is told
  the measured median, the deployment's limit for one call, and what is left. They decide.

## C · Before and after

These come from `perf-bench.mjs`, through the real route handlers, under identical conditions for both runs:
- **Model time:** the measured per-stage medians, multiplied by 0.1.
- **Database:** 40 ms per round trip.
- **Before:** commit fb5fc89, the code before this work.

"Model time" puts the 0.1 back; it is the same before and after, which shows the conditions matched. "SocriaUX's
time" is everything except the model.

| Scenario (tiered routing, the default) | Before | After |
|---|---|---|
| A · Starting Fresh: SocriaUX's own time | 1,083 ms | **534 ms** |
| A · …at 100 ms per database round trip | 2,512 ms | **1,140 ms** |
| A · Model calls; model time | 5; 76.8 s | 5; 76.9 s |
| A · First response from the server | after the whole step (0.56 s here; the step's full model time in production) | **7 ms** (streamed "accepted") |
| B · Three question turns: SocriaUX's own time | 537 ms | **250 ms** |
| D · First design: SocriaUX's own time | 208 ms | **87 ms** |
| E · Six small edits: model calls | 5 | **0** (all six in code, 0.3–4 ms each) |
| E · …input tokens; model time | 10,941; 16.8 s | **0; 0 s** |
| F · A complex refinement | 1 premium call | 1 premium call (unchanged, as it should be) |
| G · 12 designers at once: model calls | 72 | **36** |
| G · …generations for 24 presses | 24 | **12** |
| G · …most model calls running at once | 25 | **12** |
| G · …input / output tokens | 166,548 / 42,468 | **74,268 / 22,776** |
| G · …first response, median | the whole step | **1 ms** |
| A stalled provider | no answer within 25 s | **504 at its deadline, said plainly** (deadline set to 12 s for this test; 55 s in production) |
| A cancelled generation | the model ran to the end | **the model stopped** |
| The provider's rate limit | 502 "could not answer" | **503, with when to try again** |
| An answer that does not hold | 502, nothing changed | 502, nothing changed |

**The legacy one-model setting.** With `SOCRIAUX_MODEL=gpt-6.1-sol`, Starting Fresh's model time falls from 207 s
to **113 s**, because medium is now its default. Small edits and the workshop scenario change exactly as above.

**What a provider can cache.** The prefix two projects share:

| Stage | Before | After |
|---|---|---|
| Generate | 58 tokens of about 3,300 | **2,031** |
| Questions | 1,406 | unchanged |
| Brief | 1,287 | unchanged |
| Art direction | 1,076 | unchanged |

On Sol, cached input costs US$0.10 per million tokens instead of US$2. Whether it is served from the cache depends
on the provider and on traffic within its retention window, and was not measured.

**Worst case per premium call.** The output cap, reasoning room included:

| | Before | After |
|---|---|---|
| Generate | 13,392 tokens | **9,296** |
| Art direction | 9,992 tokens | **5,896** |
| Legacy, at high effort | up to 21,584 tokens | **9,296** |

A runaway generation on Sol is now bounded at about US$0.09, from US$0.13 (US$0.22 under the legacy setting).

**Cost per new project, from the measured medians.** These are not new measurements.

| Configuration | US$ per new project |
|---|---|
| Tiered routing (questions ×2, brief, art direction, design) | 0.034, unchanged |
| Legacy setting, before (high) | 0.082 |
| Legacy setting, after (medium) | **0.053** |

Small edits that used to cost about US$0.008 and 17 s of model time for the six now cost nothing.

## D · Quality

- **The creative stages are untouched.** Art direction, generation and complex changes are still on the premium
  model. The generator's instructions are the same words in a cache-friendly order.
- **Routing changes rest on the live evaluation.**
  - **Medium for Sol:** as good as high on quality, distinctiveness and fidelity.
  - **GPT-6 Luna:** scored 98.8 on quality against Sol's 95–98.
  - **Critique:** a critique of a selected part now goes to the economy model on that basis. A question about the
    whole design stays premium.
- **Quick edits keep everything else.** They apply the same validated patches the model's changes do, with the same
  checks for locks, the design system and section locks, plus a contrast check the model was trusted to make.
- **The design benchmarks still pass on the new code:**
  - craft: 15 of 15 (no generated look nobody asked for in 720 directions);
  - layout: 18 of 18;
  - overhaul: 52 of 52;
  - booking: 62 of 62.
- **The interface run** (`ui-qa.mjs`) passes 66 of 66 against a production build, including:
  - the working strip;
  - one generation for a double press;
  - a quick edit asked about and applied;
  - a cancel that leaves the canvas exactly as it was;
  - the diagnostics.

## E · Remaining risks

- **No live provider call was made.** Real time to first output, real cache hits and latency under a real
  workshop's load are unmeasured. A short live run (about US$1–2, with approval) would settle them.
- **Production was never inspected.** The demo's own logs and configuration could not be read. The legacy-setting
  cause is likely, given the documentation, but unconfirmed.
- **The 60 s limit leaves Sol 40 s.**
  - One generation in six on Sol at medium took longer than that in the live run, and would now be answered by Luna
    in the same request (the designer is told).
  - On a plan that allows longer, raise `maxDuration` in the routes together with `SOCRIAUX_ROUTE_BUDGET_MS`.
- **Some state lives in each server instance.** Concurrency counts, the reuse of a finished action's answer and
  unusual-use flags are per instance. The rate limit and budgets are shared through Upstash and the database.
- **The SDK doesn't type the cache key.** `prompt_cache_key` is not in the installed SDK's types (openai 4.104), and
  is sent as Logos already sends it.
- **The schema must be updated.** Organisation budgets and the telemetry columns need `supabase/schema.sql`
  re-run. Until then calls still work, without them.
- **No ESLint.** The repository has no ESLint configuration; the build's type check and `tsc` are the checks run.

## F · Workshop readiness

SocriaUX is ready for a moderated UX Club workshop once three things are done:
1. **Configuration:** `SOCRIAUX_MODEL` unset, `SOCRIAUX_MAX_CONCURRENT` set to the room's size or a little under,
   and an organisation budget for the club.
2. **Provider limits:** check that the OpenAI account's rate limits allow that many premium calls at once.
3. **A live rehearsal:** one rehearsal with real models on the deployment itself.

It is not yet tested under real concurrent load against the real provider.

## G · Deployment

1. **Re-run `supabase/schema.sql`.** It adds the telemetry and `org_id` columns to `ux_v0_calls` and an index on
   `(org_id, day)`.
2. **Set or check the environment** (`.env.example` lists every setting with its measured default):
   - leave `SOCRIAUX_MODEL` unset;
   - `SOCRIAUX_ROUTE_BUDGET_MS=55000` and `SOCRIAUX_PREMIUM_TIMEOUT_MS=40000` are the defaults;
   - for a workshop: `SOCRIAUX_MAX_CONCURRENT`, `SOCRIAUX_ORG_DAILY_USD` and `SOCRIAUX_ORG_MONTHLY_USD`.
3. **Watch:**
   - `[ux-v0 op]` lines: one per operation, with stage, outcome, tokens, cost and times;
   - `[ux-v0 unusual]` lines;
   - `ux_v0_calls` grouped by stage, outcome and day: where the time and the money go.

## Running the benchmark

Build the modules under test:

```bash
node -e "import('./test/helpers/build.mjs').then((m) => m.buildAll())"
```

Run the benchmark:

```bash
UXV0_OUT=/tmp/perf node test/browser/ux-v0/perf-bench.mjs
```

To measure another checkout under the same conditions (its test bundle built), set `PERF_ROOT`:

```bash
PERF_ROOT=/path/to/other/checkout UXV0_OUT=/tmp/perf-before node test/browser/ux-v0/perf-bench.mjs
```
