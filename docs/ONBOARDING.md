# First run

How Socria teaches itself, once, in three places — and why it is one system
rather than three.

## The shape

```
ONE ONBOARDING, FOR ALL OF SOCRIA (components/onboarding/FirstRunIntro.tsx)

  premise   "Most AI gives you an answer. Socria helps you build the thinking behind one."
  name      "First — what should we call you?"            lib/onboarding-name.ts
  who       "What do you mostly think about?"             lib/onboarding-roles.ts
            Studying · Building · Researching · Making · Leading · Helping people · Life, mostly
  how       "How do you like to think something through?"
            Talk it through → Core 4  ·  See it laid out → Logos 3 where it is
            offered, Logos 2 where it is not
  thought   "What are you trying to figure out, <name>?"  five starting points as cards,
            ordered and worded for what they think about

CORE        one line, once, after the first real reply

WHAT CHANGED, ONCE, FOR WHOEVER USED SOCRIA BEFORE THE MAP
(components/onboarding/WhatsNew.tsx)

  killed    "We killed the chatbot. Socria is a map of your thinking now."
            — every conversation they had is on it, counted; nothing was lost
  map       "Your map, not a list." — subjects as circles, conversations as
            discs, a link they made as a dashed line; the lenses: Today and
            This week as a map, This month and All time as a line through time
  box       "Everything starts in one box." — ask, or drop notes in and they
            are sorted onto the map; Projects are on it too
```

Every step is skippable, and anything already answered on this browser is not
asked again. The model question is asked only where no surface has been chosen
yet (/onboarding, for anyone who can open both); over the chat or over Logos the
surface is the answer. There is no Logos-only sequence any more: the three-beat
coach marks over a first map (lib/onboarding.ts, components/FirstMap.tsx) were
removed. The first map still rises card by card once, with nothing to press.

## Logos 3, where it is offered

Logos 3 is offered on every deployment, production included
(`isOffered('logos-3')` in `lib/socria-model-store.ts`, the one rule every menu
uses). Until 9 October 2026 production listed it only once its access code had
been entered; opening it to everyone changed all of this at once, with no copy
to edit. Where Logos 3 is not offered, onboarding falls back to Logos 2.

- **The model question.** "See it laid out" names *Socria Logos 3*: "Your
  reasoning drawn as a live map, and what you describe built beside it: models
  you can move, alone or with someone." Its picture adds a model and a second
  person to the map. The choice is carried through the handover
  (`Carried.model` in `lib/onboarding-script.ts`), so the chat opens the Logos
  that was chosen rather than its default — and Logos 2 if Logos 3 is no longer
  offered by the time they land.
- **The first screen.** "Think out loud" adds what Logos 3 builds: a model you
  can move, a matrix you can work, a shape in Live 3D. Its first opening is a
  system to build — *A spring that won't settle* — in the place of the
  derivative (`LOGOS3_OPENINGS`); its assumption ("more damping always settles
  it faster") is one the model itself shows to be wrong past critical damping.
- **The tour** (`LOGOS3_TOUR`): the map; the one box ("Ask, or say what to
  build"); "+ View" (`data-tour="views"`, where a model, its parameters or
  Live 3D open beside the map); switching to Core 4.
- **The "?" guide** (`LogosGuide edition={3}`): the map and its cards, then
  what Logos 3 adds, each shown in miniature — a model built from a sentence
  (computed by the engine, not the AI); the chat working everything (a row
  operation computed in place); the views beside the map; and thinking it
  through with someone, Socria between you. Shared steps are the same objects
  as Logos 2's, so the two walks cannot drift apart.

The name and the answer to "what do you think about" live in this browser, are
changeable under Manage Account, and reach Socria as one sanitised line each —
the name to be used rarely, the role only to pick examples that land.

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
| `logos.merged` | their Core chats were brought into Logos 5 (recorded, not taught) |
| `socria.opened` | the new Socria — the map, not the chatbot — first opened, on any device (recorded, not taught) |
| `socria.new` | "We killed the chatbot." was shown to someone who used the old Socria (or skipped) |

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

Decisions live beside the record: `wantsIntro`, `wantsCoreLine`,
`usedBefore` and `wantsWhatsNew`; the Logos sequence's own planner is
`lib/onboarding.ts` (`planFor`, `advance`, `shouldStart`).

## "We killed the chatbot." — for whoever used Socria before the map

Told once, to the people it changed for, and to nobody else.

- **Who.** Somebody who did something before the new Socria first opened for
  them: a milestone in the record, or a conversation last touched, earlier
  than `socria.opened` (`usedBefore`). That moment is per person, not a launch
  date — `useFirstRun` reaches it the first time any page that reads the
  record is ready, and the account merge keeps the earliest across devices —
  so whenever this reaches somebody, everything they did before it was the old
  Socria's, and everything after it is the new one's. Strictly earlier, so
  nothing the new Socria records counts; `logos.merged`, `socria.opened` and
  `socria.new` are recorded rather than done and never count. A person who
  began on the new Socria is never told, however much they do later; a
  stranger with nothing gets the premise instead.
- **When.** Not before their conversations have loaded, not before the
  account's copy of the record is in (`synced` from `useFirstRun`, computed in
  render so the frame where sign-in lands is already not synced — a second
  device never flashes it at somebody who read it on the first), never over
  the premise, never while a reply or a sort is under way, never twice.
- **Where.** On Logos 5, over the Universal Map and only there (not over an
  open conversation, a shared one or a room): the last button, *Show me my
  map*, lifts it away to show the real map underneath. On Core's chat, for an
  account (the map is an account's): *Take me to my map* is the picker's own
  switch (`pickModel`), so the open chat comes along and Logos opens on the
  map.
- **What.** Three beats, each a sentence and a drawing that does what the
  sentence says: a chat folding bubble by bubble into the map; the map read,
  the lens walking Today → This week → This month → All time and the map
  becoming a line through time; the box typed into, a file dropped in, sent,
  and landing on the map sorted into topics. Skip (or Esc) at any point —
  either way it is never shown again, on any device. Arrow keys step; focus
  comes in with it. Every drawing rests at the end of its story without motion.
  Themed by the root variables, with its own colours per dark ground.
- **Testing.** Manage Account → Testing → *Replay "We killed the chatbot."*
  takes back `socria.new` and `socria.opened` (`REPLAYS.new`), so on the next
  load the line moves to now and everything already there counts as before.
  Replaying everything keeps `socria.opened`, like the merge.

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
- **Somebody who used Socria before the map** → "We killed the chatbot.",
  once, over the map (or over Core's chat, leading to it) — see above.

## Core

After the first reply they have ever had, one line under it, in the thread's
margin. Dismissed by × or by continuing; continuing is the aha. The furniture
tour and the Core 4 announcement **no longer open on a first visit** — both
stay reachable (account sheet; the pill beside the composer).

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
mount), `onboarding_skipped` on any skip with the step. "We killed the
chatbot." has `whats_new_started` (once per showing) and `whats_new_completed`
(the fresh `socria.new`, finished or skipped; a skip is also
`onboarding_skipped` with step `socria.new`).

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
