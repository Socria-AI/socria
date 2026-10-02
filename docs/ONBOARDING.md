# First run

How Socria teaches itself, once, in three places — and why it is one system
rather than three.

## The shape

```
SOCRIA            the premise, once      "Most AI gives you an answer.
                                           Socria helps you build the thinking behind one."
                                          "What are you trying to figure out?"
  │
  ├── CORE        one line, once          after the first real reply:
  │                                       "You'll still do the thinking. Core helps you
  │                                        see what you're missing."
  │
  └── LOGOS       three beats, once       on the person's own first map or model:
                                          "This is your thinking becoming a model."
                                          "Change the model, and Logos updates what depends on it."
                                          "Now keep thinking."

  …and, on every surface, things FOUND along the way — each once, when its
  value is legible on screen, never on a timer.
```

Nothing performs itself. Every beat advances on something the person did.
Nothing is onboarding-specific: the first reply is the engine's own, the
first model is the engine's own, the cue names a parameter because the
canonical model calls it one and mentions a backend because one ran.

## The record — `lib/first-run.ts`

One record, keyed by **milestone** rather than by screen:

| milestone | reached when |
|---|---|
| `socria.intro` | the premise was shown (or skipped) |
| `socria.thought` | a first thought was submitted, on any surface |
| `core.first` | Core's one line was shown and dismissed/continued past |
| `core.aha` | they continued the conversation past the first reply |
| `logos.first` | the Logos sequence opened on their own map/model |
| `logos.model` | their language became a map or model for the first time |
| `logos.manipulated` | they moved a value |
| `logos.inspected` | they opened an object / pressed a card |
| `logos.asked` | they asked about an object by its identity |
| `logos.aha` | the sequence released them (or they skipped it) |
| `found.trace` `found.views` `found.dependencies` `found.compare` `found.evidence` | a capability was said once, when legible |

- `reach()` is idempotent and reports `fresh`; **only a fresh milestone sends
  an analytics event**, so a refresh double-counts nothing.
- Stored in the browser under `socria.firstrun.v1` (kept through the account
  sweep in `lib/local-data.ts`: it describes what this device has shown, not
  who was here).
- For an account, merged once per page life with `user_profiles.first_run`
  through `/api/profile` (`components/useFirstRun.ts`). The merge is a
  **union, earliest time wins**, so two devices cannot argue and a stale tab
  cannot un-teach.
- The older flags (`socria.firstmap.v1`, `socria.logos.guide.v1`,
  `socria.core4IntroDontShowAgain.v1`, `socria.tour.v1`) are read as legacy
  milestones, so nobody who finished the old sequences is taught again.
- A blocked store reads as *everything learned*: re-teaching someone every
  visit is the worse failure. A corrupt value reads as *nothing learned* and is
  overwritten on the next write.

Decisions live beside the record: `wantsIntro`, `wantsCoreLine`; the Logos
sequence's own planner is `lib/onboarding.ts` (`planFor`, `advance`,
`shouldStart`).

## Routing, and who sees what

- **New account** → `/sign-up` → `/onboarding` (the premise, then the thought)
  → `/chat` with the sentence carried in session storage (`lib/onboarding-script.ts`).
  `/onboarding?to=logos` carries it into Logos instead (the Logos page's door).
- **Signed-out visitor** on `/chat` with nothing → the same premise, over the
  chat, then the thought goes into the composer. Core 3.1 is open signed out;
  one free conversation, then sign-in.
- **Anyone** opening Logos with nothing and no record of the premise → the same
  premise, over Logos, then the thought goes into Logos's composer.
- A person with work on screen is never shown the premise, whatever the record
  says. A Core veteran opening Logos gets the Logos beats and nothing else. A
  Logos-first person is not re-introduced to Socria by the chat.
- Nobody is asked "Core or Logos?". The surface you are on is the surface you
  start in.

## Core

After the first reply they have ever had, one line under it, in the thread's
margin. Dismissed by × or by continuing; continuing is the aha. The furniture
tour and the Core 4 announcement **no longer open on a first visit** — both
stay reachable (account sheet; the pill beside the composer).

## Logos

`lib/onboarding.ts` plans three beats from the **shape** of what is on screen
(`model` or only a map; how many controls; the first control's canonical kind
and label; whether a backend ran — read from `computationFacts`). The
sequence opens when the first map has four nodes or a model document exists,
never while a reply streams or a sentence is being typed, and never for
someone whose record says `logos.aha`.

- The map **emerges** once (cards rise in turn, lines draw) — `emerging` on
  `ThinkingMap`, off under reduced motion.
- On a model with a control the cue is "Try changing this — move *label*" and
  the first slider breathes; on a map, "Press any card to go on".
- Moving a value → "Change the model, and Logos updates what depends on it",
  naming the operation and backend **only if one ran**.
- "Ask about this" (or a card's own Explore/Challenge/Trace) → "Now keep
  thinking." → released. Skip is one press from anywhere.

Signals come from real events: `onModelEdited` (a value moved vs a
selection), the card menu, `onAskAbout`.

## Found along the way

`LogosApp` computes at most one note from the real model: ≥3 dependents of
the selection → *Dependencies*; `whatChanged` → *Changed*; `computationFacts`
→ *Computed*; `viewsFor(model).length > 1` → *Views*; a `supports` edge onto a
supported card → *Evidence*. Each shows once (milestone + `socria.hints.seen.v1`
dismissal, so "Show hints again" restores them), never during the sequence,
never while streaming. Branch is not offered because the product has no
branch — nothing is taught that does not exist.

## Analytics

Vocabulary in `lib/analytics.ts`; shape only (`surface`, `step`, `object` —
kinds, never labels or words). Each first-run event fires once per person, on
a fresh milestone. `socria_intro_started` fires once per showing (component
mount), `onboarding_skipped` on any skip with the step.

## Guests, and claiming a guest's record

Guest mode exists for Core (`mode === 'local'` on `/chat`: conversations in
`localStorage`, one free conversation). Logos needs an account. The first-run
record is browser-first, so a guest's progress survives sign-in on the same
browser: `useFirstRun` uploads it the first time it sees an account with no
record (or merges with one). What is **not** migrated today is the guest's
local conversation into the account — the chat's existing sync-on-load
(`socria.cloudMigrated.v1`) handles conversations; Logos sessions are
cloud-only. To make a guest Logos session claimable, Logos would need a local
session store behind the gate and the same merge-on-sign-in the chat has —
see `lib/local-data.ts` for every key involved.

## Failure states

- The premise never blocks the product: Skip is always one press; a blocked
  store never throws; the carried sentence is capped and sanitized.
- The Logos sequence only opens over a real shape and only advances on real
  acts; a failed or slow extraction simply means it has not opened yet. A
  refresh mid-generation reloads the stored session and the sequence starts
  (or not) from the map that is actually there.
- A model with nothing to move asks to open something instead; a model nothing
  computed says nothing about computing.
- Reduced motion: no emergence, no pulse, no word-rise.
