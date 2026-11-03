# Model routing (Logos 5)

Which model answers is decided on the server, per call, by **who is asking** and **how much the turn needs**. Code: `lib/model-router.ts`. Benchmark: `docs/MODEL-ROUTING-BENCH.md`.

## The table

|          | light (a thanks, a hello) | standard (most work) | deep (proof, maths to check, pushback, documents, building, many-part) |
|----------|---------------------------|----------------------|-------------------------------------------------------------------------|
| Guest    | GPT-4o mini               | GPT-4o mini          | GPT-4o mini                                                             |
| Free     | GPT-6 Luna                | GPT-6 Luna           | GPT-6 Luna                                                              |
| Socria One | GPT-6 Luna              | GPT-6.1 Terra        | GPT-6.1 Sol                                                             |

- **The tier** is `tierOf(userId, plan)`: no session is a guest; the plan is `resolvePlanForRequest` (a paid subscription or the operator's allowlist). No request can name a model.
- **The level** is `levelOf(facts)`, deterministic and free: what the chat route already knows — the exchange (social/playful/personal is talk), the move, a claim of theirs to check or something to compute (lib/accuracy), pushback or a disagreement, documents, something being built, words that ask for depth ("prove", "step by step", "trade-offs", "steelman"…), three or more questions, a very long message. An "ok" to a question Socria asked is an answer, never small talk.
- **A refused model steps down, never up** (`LADDERS`): GPT-6.1 Sol → GPT-5.6 Sol → GPT-6.1 Terra → GPT-4o; Terra → GPT-5.6 Terra → GPT-5.6 Sol → GPT-4o; GPT-6 Luna → GPT-5.6 Luna → GPT-4o mini. Guests and the free plan never fall back to a member's model.

## Where it applies

Every Logos 5 call: the reply (`app/api/logos/chat`, header `X-Socria-Model: tier/level/model`), the map pass (standard), explore, read, write, easy view, experience, the docs page, organize and practice (standard), both syntheses (deep — Sol for a member), and the memory extractor (GPT-6 Luna for everyone, stepping down to GPT-4o mini).

## Token savings

- **Routing** itself — the free plan's replies were on GPT-5.6 Sol; One's light turns go to Luna, its deep ones alone to Sol.
- **Prompt cache key** per line of thinking (`cacheKey`, hashed) on the reply and the map, so one conversation's requests land on one cache. A provider that refuses the parameter gets the call again without it (`lib/openai-usage.ts`).
- **History compression** (`compressHistory`): Socria's replies older than the newest four messages are read back as their opening and their ending (2,400 characters). The person's words, and the reply they are answering, are never clipped. Deterministic, so the cached prefix survives.
- Already in place and kept: the stable prompt first and this turn's context last (cacheable prefix), the history window moving in steps of 16, the map skipped on turns that cannot change it, no memory extraction on an "ok".

## Switches (environment, read at call time — no redeploy)

| Variable | Effect |
|---|---|
| `LOGOS_ROUTER=off` | Every call back on its single pre-routing model (`OPENAI_MODEL_LOGOS`, `OPENAI_MODEL_LOGOS_MAP`… honoured again). |
| `OPENAI_MODEL_<TIER>_<LEVEL>` | e.g. `OPENAI_MODEL_GUEST_STANDARD=gpt-6-luna`, `OPENAI_MODEL_ONE_DEEP=gpt-5.6-sol`. |
| `OPENAI_MODEL_MIND` | Pins the memory extractor to one model. |

With routing on, `OPENAI_MODEL_LOGOS` and `OPENAI_MODEL_LOGOS_MAP` no longer move a call — check the production environment for them before relying on the table.

## Prices used

From OpenAI's launch pages (November 2026), read through search results — openai.com could not be fetched from the build machine. Per million tokens, input / cached / output: GPT-6.1 Sol $2 / $0.10 / $10; GPT-6.1 Terra $1 / $0.05 / $5; GPT-6 Luna $0.10 / — / $0.50; GPT-4o mini $0.15 / $0.075 / $0.60. Confirm on the pricing page; the ids must also be enabled on the account (a refused id steps down, and the log says so).
