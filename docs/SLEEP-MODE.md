# Sleep Mode

> **Superseded on November 9, 2026 by the seven-day trial ([TRIAL.md](TRIAL.md)).** The holding and settling below is unchanged and still runs every request; the period is now the trial's UTC day (4,000 tokens, 28,000 in all) instead of the week, and an ended trial is refused with 402. The weekly words remain in `lib/sleep.ts` for the screen's week-period state only.

A signed-in free account may spend **30,000 model tokens a week** on the AI requests it makes, across conversations, artifacts and Logic Maps. The week starts on **Monday at 00:00 UTC** and ends at the next Monday 00:00 UTC. When the week's tokens are spent, Socria rests until the reset: no new AI requests are made. Everything already made stays usable: conversations, Logic Maps, artifacts, writing, Files, manual map edits and exports. The conversation box still takes their words, so they can draft; sending waits for the reset.

Socria One is never counted. It keeps its own subscription limits (the fair-use ceilings in `lib/entitlements.ts`), and a member never sees the allowance. Guests have their own pass (`lib/guest-pass.ts`), which this does not change.

This replaced the daily allowance on 6 November 2026. No daily token count is kept, read or configured any more.

## What counts, and what does not

**The rule:** a model call is counted when its answer reaches the person — the reply, a map, an artifact, a reading. It is counted at the input the provider read afresh plus everything it wrote. Our own overhead is not counted: an attempt that failed, a second attempt we make because our own check rejected the first, input the provider served from its prompt cache, and work the person did not ask for. Nothing is counted twice.

| Counted (when made for a signed-in free account) | Where |
|---|---|
| The reply in a conversation or in a node's own thread | `app/api/logos/chat` |
| A Core conversation's reply (Core 4, Core 3.1, Core 2) | `app/api/chat` (`seam/reply`) |
| Logic Map passes: the extraction, its second pass, a display or model drafted with the map (the first draft) | `app/api/logos/map` |
| Explore, Research, Challenge and Trace on a node, including the query that builds a search | `app/api/logos/explore` |
| Artifacts: an easy view of a photo (the first reading), an experience's answer (the first), a page or figure read into a document | `app/api/logos/easy`, `app/api/logos/experience`, `app/api/docs/page` |
| Write assists on their own writing | `app/api/logos/write` |
| Reading an image | `app/api/logos/read` |
| Sorting files into topics, practice | `app/api/logos/organize`, `app/api/logos/practice` |
| A synthesis of the map, or of a Project | `app/api/logos/synthesize`, `app/api/projects/[id]/synthesize` |
| A file read into Memory (each part of it) | `app/api/mind/upload` |
| An insight or a synthesis on the older Core surface | `app/api/generate-insight`, `app/api/generate-synthesis` |

| Not counted | Why |
|---|---|
| An attempt that failed: a model refused or failing on the router's ladder, a refused parameter asked again, the provider's own retries | Only the attempt that answered is counted. A failed call holds tokens only until it fails, then gives them all back. |
| Input served from the provider's prompt cache (`cached_tokens`) | It is ours to have laid the prompts out for the cache. The uncached input is counted. |
| A second attempt after our own check refused the first: the reply's accuracy regeneration, a display draft sent back once for repair, an easy view read once more, an experience asked once more, Core 4's guard retry | The person asked once. The first attempt is counted, the second is not. |
| Checks and regulation of a draft: Core 4's guard and checker, Metacognitive Regulation's deliberation, Core 3.1's state pass, reading a conversation's state | They steer our own reply, and their output never reaches the person. |
| A conversation's title, the memory kept after a turn (the Mind graph, the thread memory, the cross-conversation understanding) | Upkeep the person did not ask for (`app/api/extract-memory`, `app/api/update-understanding`, `lib/mind/pipeline.ts remember()`). These routes are also paused while an account rests, so no model is asked for them then. |
| A web search (when the provider is the model's own search) | What it finds is counted where it is read: in the reply or the Explore panel that it feeds. |
| Background map drawing for conversations brought in from elsewhere | It runs only for Socria One (`LogosApp drawOwed`). For a free account the map is drawn when they open the conversation, and that pass counts like any other map pass. |
| Voice transcription | Socria Voice is part of Socria One; a free account is refused it (402). |
| The model health check, evaluations | Not made for a person. |

Reasoning tokens are part of what a call wrote, so they count; the provider bills them as output. Trace (where a thought came from) is never limited by a monthly count (`lib/entitlements.ts`), but it is an AI request, so it counts and waits while Socria rests, as it did under the daily allowance.

## How it is enforced

| Part | Where |
|---|---|
| The week, the limit, the words | `lib/sleep.ts` (pure): `WEEKLY_TOKENS`, `weeklyLimit`, `weekStart` and `resetAt` (Monday 00:00 UTC), `weekKey`, `sleepState`, `wakesIn`, `localReset`, `allowanceLine`, `sleepRefusal`, `countedTokens` |
| Holding and settling one call | `lib/token-allowance.ts`: `holdTokens` against a `TokenStore`, the estimates (`requestTokens`, `estimateTokens`), `TokenRefusal` |
| Whose request a call is | `lib/token-meter.ts`: AsyncLocalStorage carries the account from the route to every model call it makes; every metered route runs in a context of its own (`withMeter`), so one request's account can never reach another; `uncounted()` marks our own overhead |
| Every model call | `lib/openai-usage.ts` `tracked()`: every OpenAI client in the app goes through it, so every call is held, capped and settled there |
| The store, the gate, the answers | `lib/sleep-server.ts`: `sleepGate`, `meterFor`, `sleepAnswer`, `restingNow`, `sleepFor`, the Supabase store |
| The database | `supabase/weekly-tokens.sql` (also at the end of the usage functions in `supabase/schema.sql`) |

**The gate.** Every route that calls a model for the person calls `sleepGate` first. A free account whose week is spent gets `429 { sleep: true, used, limit, left: 0, weekStart, resetAt, error }` with `Retry-After`, and no model is called. The client already treats this payload as Sleep Mode. When the account is awake, the route meters the rest of the request (`meterFor`).

**One call: hold, cap, settle.** Before each model call made while a request is metered:

1. **Hold.** The call holds what it may cost: its input, estimated from what it sends (UTF-8 bytes ÷ 4, plus 20%, plus a fixed allowance for each image), plus the most it may write (its `max_tokens` or `max_completion_tokens`, reasoning room included). `reserve_logos_tokens` holds up to that many, atomically, and never more than the week has free: the limit, less the tokens already settled, less what other calls still running hold. If anything is free, the call starts. If nothing is free and nothing is held, it is refused as Sleep Mode before the provider is asked. If nothing is free because the person's other calls still hold the rest (usually their own reply, while the map pass for it starts), it waits up to 8 seconds for those calls to settle. It is then refused as Sleep Mode if the week is spent, or as busy (`429 { busy: true }`) if they are still running.
2. **Cap.** A call that answers in plain text (the reply, a reading) may write no more than the week has left, with a floor of 300 tokens plus any reasoning room, so an answer is never a stub. A call that answers in JSON keeps its own cap, which is bounded, because a JSON answer that is cut off is no answer. No call runs without a cap.
3. **Settle.** When the call ends, `settle_logos_tokens` releases the hold and adds what the call really cost (`countedTokens`: uncached input plus output). A call that used less than it held gives the rest back. A call that read more than the week had left is recorded as it was. The week can therefore end a little past 30,000, by at most the one call that took the last tokens, and Socria then rests. A call that failed costs nothing. A stream that stopped before its usage arrived (the person pressed stop, refreshed or left) is settled at an estimate of what it read and what it had written by then, so stopping a reply is never a way round the count.

**Refreshes, tabs, devices, concurrent requests.** The count is one row per account per week, `logos_usage (user_id, 'week:<Monday>', 'tokens')`, keyed by the Clerk account id. Nothing is kept per device, session or browser, and the client is never trusted with a number. A refresh, a second tab, a second device or a cleared browser all read and draw on the same balance. Both database functions take the week's row lock first (`SELECT … FOR UPDATE`), so concurrent holds for one person run one at a time. Two requests can never both be given the same last tokens: once the free tokens are held, every other request waits or is refused. Settling is idempotent: a settle sent twice adds once.

**A call refused mid-request.** If another request takes the last tokens between the gate and a later call (for example, two tabs at the edge), that call throws `TokenRefusal` before the provider is asked. Each route answers it with `sleepAnswer`, which returns the same Sleep payload as the gate. In Core 4, where the reply's call starts inside the stream, the stream says the same sentence (`lib/upstream-error.ts streamFailureNotice`).

**When the store cannot be reached: fail closed.** If the week cannot be read, a hold cannot be written, or the store answers with anything but the function's own answer, a free account's AI request is refused with `503 { unavailable: true }` and a plain sentence ("This week's free tokens can't be checked right now, so new requests to Socria are paused…"). We chose this over letting requests through uncounted, which would give free accounts unlimited use whenever the database is unreachable. Socria One, guests and manual work are unaffected. A settle that cannot be written is retried once, then logged (`[sleep] N tokens … could not be settled`). Its hold then expires after 10 minutes, so the person is never charged for it.

**A hold that never settles** (a crash, a platform timeout) stops counting after 10 minutes and is cleared on the account's next hold.

## The database: what production needs

Run `supabase/weekly-tokens.sql` once in the Supabase SQL editor. It is add-only: it creates two functions, `reserve_logos_tokens` and `settle_logos_tokens`, over the existing `logos_usage` table, and changes no table, column or row. It is safe to run again. Holds live in the same table as rows of their own (`tokhold:<week>:<call id>`), which the usage panel never reads.

Until it is run, holds go through the older `consume_logos_usage` and are settled with `refund_logos_usage` and `bump_logos_usage` (`supabase/freemium.sql`). This is as strict, because nothing past the limit is ever held. It is coarser, though: a hold counts as part of the week's total until it settles, so a request made while another is running may be told Socria is resting a moment early, and a hold whose request dies is never given back. Without those functions either, free accounts' AI requests are paused, and the log says why. The local stand-ins (`scripts/dev/usage-functions.mjs`, served by `scripts/dev/fake-postgrest.mjs`) implement both functions with the same semantics.

## What the person sees

| Where | What |
|---|---|
| The ring beside the box's tools (`SleepRing`) | Fills as the week is spent. Hover or press: "This week's tokens · 12,400 of 30,000 left this week · Resets Monday 00:00 UTC (in 2 days 4 h) · Sunday 6:00 PM your time". The local time is shown, in the browser's own format, where the browser has a zone other than UTC. Filled solid while resting; pressing it then opens the screen. |
| The screen (`SleepScreen`), said once when it happens | "Socria is resting. You've used this week's 30,000 free tokens. Everything you've made is still here…", "Wakes in 2 days 4 h", "Monday 00:00 UTC · Sunday 6:00 PM your time", Keep exploring, and, offered, "Stay awake with Socria One" ("Socria One has no weekly limit.") |
| The bar over the box (`SleepBar`), while resting | "Resting until Monday 00:00 UTC · 2 days 4 h". The box still takes their words; sending opens the screen and keeps the words. |
| A refused request | The turn goes back in the box. The map they have stays as it is. |

The numbers come from `/api/logos/usage` (`sleep`), which reads the same row on every device. The app reads it again after each turn settles. Socria One and guests get no `sleep` state, so they never see any of this.

## Switches (environment, read per request, no redeploy)

| Variable | Effect |
|---|---|
| `SOCRIA_FREE_WEEKLY_TOKENS` | The limit, as a positive whole number (default 30000). |
| `SOCRIA_SLEEP=off` | Sleep Mode off for everyone, for an incident. Nothing is counted while it is off. |
| `SOCRIA_TOKEN_WAIT_MS` | How long a call waits for the person's other calls to settle before it is told busy (default 8000). |

## What 30,000 tokens buys

Measured from the prompts as they stand (`docs/MODEL-ROUTING-BENCH.md`, `docs/DEPLOYMENT.md`; tokens ≈ characters ÷ 4). The prompt cache makes most of the difference, and cached input is not counted:

- **The reply** reads about 6,500 tokens, of which about 6,400 is the stable part the provider can serve from its cache on the next turns of the same conversation. Without a cache hit (a conversation's first turn, or after the cache has lapsed) a reply costs about 7,000 tokens. With one, it costs what is new plus what it writes, often under 1,500.
- **The map pass** reads about 19,000 tokens of instructions plus the map and the conversation, so it costs 20,000 or more without a cache hit and a few thousand with one.

So a week holds a few full turns, many more when they continue one conversation (the cache hits), and fewer when every turn starts somewhere new. If the free plan's model does not report cached input, everything it reads is counted at full size.

Tests: `test/sleep.test.mjs` (every model-calling route end to end, Socria One, guests, the store failing, and the screen) and `test/weekly-tokens.test.mjs` (the week's arithmetic, holding and settling against an in-memory store and against the dev database over HTTP, the call wrapper).
