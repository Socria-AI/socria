# Sleep Mode

A signed-in free account may spend **35,000 model tokens a day**: every call made for it, input and output together. When the day's are spent, Socria rests until the next reset. No new AI requests are made. Everything already made stays usable: conversations, Logic Maps, artifacts, writing, and everything done by hand. Socria One is never counted. Guests have their own pass (`lib/guest-pass.ts`).

## How it works

| Part | Where |
|---|---|
| The day, the limit, the words | `lib/sleep.ts` (pure): `DAILY_TOKENS`, `resetAt` (next UTC midnight), `sleepState`, `wakesIn`, `sleepRefusal`, `tokensOf` |
| Counting | `lib/sleep-server.ts` registers with `lib/openai-usage.ts` (`onUsage`). Every model call's `prompt_tokens + completion_tokens` is charged to the account metered for that request, found through AsyncLocalStorage. It is one row in `logos_usage` (counter `tokens`, scope the UTC day), written with the same atomic `bump_logos_usage` as every other counter. No migration was needed. |
| Enforcement | `sleepGate(req, userId, plan)` runs at the top of every Logos 5 route that calls a model: chat, map, explore, read, write, easy view, experience, synthesis (both), docs page, organize and practice. When the day is spent, the route returns 429 `{ sleep: true, used, limit, resetAt }` with `Retry-After`, and no model is called. When the day is not spent, the route meters the rest of the request (`meterFor`). |
| The app | `/api/logos/usage` returns `sleep` (the same state on every device). `components/logos5/SleepMode.tsx` provides `useSleepWatch`, which hears a Sleep reply from any route, plus `SleepScreen` (said once, with a countdown and optional Socria One) and `SleepBar` (one line over the box while it lasts). |

## Behaviour

- **A turn begun under the limit is finished.** The next request rests. Nothing is cut off mid-sentence.
- **A refused turn goes back in the box.** Nothing they typed is lost. Sending again while resting opens the screen and makes no request.
- **Subscriptions apply on the next request.** Subscribing wakes Socria at once, and a member is never counted. A subscription that ends mid-day puts the day's free count back in force.
- **Store failures don't block anyone.** If the usage store cannot be read, the request goes through.

## Switches (environment, read per request — no redeploy)

| Variable | Effect |
|---|---|
| `SOCRIA_FREE_DAILY_TOKENS` | The limit (default 35000). |
| `SOCRIA_SLEEP=off` | Sleep Mode off. |
| `SOCRIA_SLEEP_METER=reply` | Count only the replies, not the map, memory or readings. |

## What 35,000 tokens buys

Measured from the prompts Logos 5 builds (`docs/MODEL-ROUTING-BENCH.md`; tokens ≈ characters ÷ 4):

- **The reply:** about 6,500 tokens in.
- **The map pass:** about 11,000 tokens in, because its instructions are long.
- **The memory extractor:** a further 1,000 to 2,000 tokens.

A full turn is therefore about 18,000 to 20,000 tokens, which is roughly **two full turns a day**. Turns where the map is skipped cost about 7,000. With `SOCRIA_SLEEP_METER=reply` it is about five replies a day. Cached input is counted at full size, because the brief says input and output.

Tests: `test/sleep.test.mjs`.
