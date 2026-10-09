# Conversation Style

One choice under **Manage Account → Personalization** sets the character
Socria talks in, in Core 4 and in Logos. The account keeps it, so it follows
the person to every device. It applies to new conversations and to the next
message of one already open.

| Style | Core 4 | Logos |
|---|---|---|
| **The Thinker** (default) | The voice as written: measured, Socratic | The voice as written: curious, inventive |
| **The Direct** | The substance first, shorter, a question only when the answer would change what comes next | Builds first and talks less; statements over questions |
| **The Companion** | Warmer and more conversational; encouragement that names what is good; more humour | Good company in the work; playful; pushes where it matters |
| **The Challenger** | Leads with the weakest load-bearing point; asks for evidence and for what would change their mind | Points at the test: the parameter to move, the case that breaks the model; flags guessed numbers |

The source of truth is `lib/conversation-style.ts`. It holds the styles, both
versions of each, the limits, the picker's copy and the browser-copy helpers.

## Where it sits

Top wins:

1. **Protected Human-First principles.**
   - Authorship and judgement.
   - The Answer Guard.
   - Core 4's per-turn decision: the move, the question budget, what is held
     back.
   - Transparency and safety.
2. **Thinking Depth.** How far the thinking goes. It is orthogonal to the
   style: Deep + Direct thinks as far as Deep + Companion.
3. **Conversation Style.** This.
4. **Logos's Personality dials.** A dial the person moved wins on the one
   aspect it names.
5. **Custom instructions.**
6. **The conversation itself.** "Be more casual", said today, wins for that
   conversation.

## How it reaches the model

**The Thinker adds nothing.** The default voice is the products' own
prompts, byte for byte. That is a test, not a promise.

### Core 4

There are two places, and both are needed.

- **The prompt.** `buildSystemPrompt(..., conversationStyle)` puts the
  style's block directly after `CORE_4_PROMPT`, ahead of the profile, the
  Project, the Mind Graph and the cognition state. The per-turn decision is
  still the last thing the model reads.
- **The per-turn register.** Core 4 decides the turn's warmth, edge, humour
  and density in code (`lib/core4/voice.ts`). That block comes after any
  prose the prompt contains. A style that only existed as prose would lose to
  it every turn. So `CommunicationPrefs.style` reaches the register too,
  through `applyConversationStyle`. Each shift is one step, never a jump:
  - The Direct drops the conversational middle: normal density becomes
    spare, warm becomes neutral, light humour becomes dry. It also leans the
    reply proportion brief, the way a Concise reply length does. A length the
    person set wins.
  - The Companion is one step warmer, and humour is one step lighter where
    the situation allowed any.
  - The Challenger's edge is one step sharper, and its humour no lighter
    than dry.
- **The situation still owns four registers.** No style moves them:
  - safety
  - the person's own words about how a reply landed
  - somebody struggling
  - real time pressure

  A Challenger does not push on a bad day. A Companion does not joke through
  one.
- **What no style changes.** The move, the question budget, coverage and what
  is withheld are identical across all four styles. The reply guard checks
  every reply against the turn's decision whatever the style.

### Logos

`conversationStyleBlock(style, 'logos')` sits after the depth and guard
guidance and before the Personality dials and custom instructions. It is
used in three places:

- the chat route
- Explore and Draft Space, in a `structured` form that keeps every field and
  limit of the panel's JSON
- not the map route: a map is structure, not voice

Logos has no per-turn register, so the block's own limits are its only hold
on a hard moment. Every style is told that somebody stuck, frustrated or
ready to give up gets no pressure and no jokes. Core 4 has the same line as a
backstop to its register.

### Not Core 3.1

Core 3.1's depth modes already set its voice ("Voice: a rigorous
interlocutor"). A second voice beside them would argue about the same
sentence.

## Persistence

**The database.** `user_profiles.conversation_style` holds the style as
text. Null means never chosen, which is the Thinker. Add the column with:

```sql
alter table user_profiles add column if not exists conversation_style text;
```

**The profile API.**

- `GET /api/profile` returns `conversationStyle`.
- `GET /api/profile?only=conversationStyle` is the cheap re-check.
- `PUT /api/profile {conversationStyle}` stores a validated value. Anything
  unknown is stored as the Thinker.
- On a database without the column:
  - GET answers `conversationStyle: null`, meaning "keep your own copy".
  - PUT answers `unsaved: ['conversationStyle']`.
  - The picker says the choice is kept on this device only.

**Each tab** (`components/useConversationStyle.ts`):

- It keeps a copy under `socria.conversationStyle.v1`. That key is swept on
  sign-out with the other `socria.*` keys.
- It hears a change in this tab or another one at once.
- It asks the account again when it comes back into view, at most once a
  minute.
- Every Core, Logos and shared-thread request carries `conversationStyle`,
  read at send time.

**Export and deletion.** The account export selects `user_profiles.*`, so the
style is in it. Account deletion removes the row.

## Testing

**`test/conversation-style.test.mjs`** (285 checks) follows the choice into
everything that reaches a model:

- the Core 4 prompt and its placement
- the per-turn register, with the held registers left unmoved
- the Direct's proportion, with a set length winning over it
- the Logos block order with depth and the Answer Guard in the prompt
- the panel form
- the wiring in the routes and clients, and in the schema

It also checks what must not change:

- the Thinker is byte-identical
- Core 3.1 and Core 2 never see a style
- the move, the budget and the coverage are identical across styles
- every style carries the limits

**`evals/style/run.mjs`** asks whether the replies actually differ:

- `prompts` writes the exact system prompt for six first turns per product.
- `live` runs them on the production models. It needs `OPENAI_API_KEY`.
- `score` gives descriptive metrics and a blind packet.
- `judged` scores a blind reader's attempt to tell the styles apart.

## Results

**Production models.** No run is recorded yet. The sandbox this was built in
cannot reach the model API. To run one, use
`node evals/style/run.mjs live --out <dir>` with a key, then `score` and
`judged`.

**Stand-in, 2026-10-09** (`evals/style/runs/2026-10-09-standin/`). Subagents
played the model exactly as each prompt said, and a blind judge matched the
replies to styles. This measures the prompts with a capable model, not the
production model.

- **Matching.** The blind reader matched 44 of 48 replies to their style
  (92%; chance is 25%), 22/24 on each product. The only misreads were the
  two turns where the person is struggling, where every style is designed to
  go quiet. Outside them it was 40/40.
- **Guardrails.** Nothing was flagged: no factual or mathematical error, no
  deciding for the person, no flattery, no pushing on or joking at someone
  struggling, no mockery.
- **A finding that changed the prompts.** In round 1, the Logos Challenger
  pushed on "I'm about to give up". Logos has no per-turn register, so the
  struggling-person line was added to every style block. In round 2 the same
  turn reads "Before you put it down, let's look at it together…".
- **Length.**
  - The Core Direct is about a third of the default's length: 69 words a
    reply against 212.
  - The Logos Direct is only slightly shorter than the Logos default (58
    against 64). The default is already two to four sentences, so the Direct
    differs there by asking nothing and building first.
