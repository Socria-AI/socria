# First run

How Socria teaches itself, once, in three places — and why it is one system
rather than three.

## The shape

```
ONE ONBOARDING, FOR ALL OF SOCRIA (components/onboarding/FirstRunIntro.tsx) — the welcome

  premise   "Socria is Human-First AI built to expand what people can see,
            understand, and do, without surrendering the ability to think for
            themselves. We're not building humanity's replacement. We're
            building technology that makes humanity more capable."
            — four phrases set in green, swept in under their words
  name      "First — what should we call you?"            lib/onboarding-name.ts
  who       "Good to meet you, <name>. What brings you to Socria?"
            Studying · Understanding something · Making a decision ·
            Building something · Writing · Researching   lib/onboarding-paths.ts
            (or "Something else")
  thought   "Where shall we start, <name>?" — three ways to start down that
            path, each a whole first message that fills the field to change or
            send; or their own words. Starting opens a line of thinking of its
            own and sends it: their first conversation, counted like any other.

  Behind the beats a Logic Map draws itself, a node per answer.

TIPS, ONCE, IN THE FIRST FORTNIGHT; A FEATURE NOW AND THEN; SOCRIA ONE ON RETURN
(lib/logos5/tips.ts, components/logos5/L5Tips.tsx, components/logos5/OneHeader.tsx)

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
asked again. There is no model question any more (it went with the Core chat on
24 October 2026), and no Logos-only sequence: the first map still rises card by
card once, with nothing to press.

## Tips, features, and Socria One on return

- **Tips** (`lib/logos5/tips.ts`, kind `tip`) are for somebody's first fortnight
  (from the welcome, else the account, else a guest's first visit): the Logic
  Map their words are making, Make, the Universal Map, search. One at a time, 25
  seconds apart, each once, in order, beside what it is about (`L5Tip`) and
  never over the box someone types in. The first-reply tour, where it ran, has
  already pointed at Make, so that tip is skipped.
- **Features** (kind `feature`) are now and then, for anyone: List, Split View,
  the tutorials, Quick capture, Voice — each with a "Show me" that does it. At
  most one a visit, two days apart, never in a visit's first 20 seconds and never
  on a visit that has had tips.
- Neither shows over the welcome, "We killed the chatbot.", a sheet, the tour,
  AR Mode, search, Voice's sheets or big-screen mode, and neither starts while an
  answer is arriving. A card counts as seen once it has been on screen four
  seconds, or pressed. Seen is kept with the hints (`socria.hints.seen.v1`), so
  Manage Account's "Show hints again" brings them back; when the browser keeps
  nothing, no cards are shown at all.
- **Socria One** — a free account has a Socria One button beside the account
  chip (the ⋯ menu was the only way before). When somebody comes back, a small
  note under it: "Welcome back, <name>." and one short line of the four the
  welcome-back prompt rotates. When is the prompt's own rule (`lib/one-prompt.ts`):
  never to a member, never on a first visit, never in a reflective
  conversation, once a tab, six hours apart. It is never drawn as a sheet.

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
  record is ready *with the new Socria open for them* (its access code entered:
  `lib/new-socria.ts`; until then nothing is recorded, and nothing is told),
  and the account merge keeps the earliest across devices —
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

- **New account** → the welcome, once per account, over Logos 5 — however they
  arrived (lib/first-run.ts `wantsWelcome`): an account made in the last week
  whose record, merged from the account first, has no `socria.intro`. That
  includes a guest who signs up and brings their line of thinking along, who
  used to miss it. `/sign-up` without a redirect still goes to `/onboarding`,
  the same welcome on its own page, which carries the sentence to `/chat`.
- **Signed-out visitor** with nothing here → the same welcome, over Logos 5.
- Whatever starts it, the first message opens a **line of thinking of its own**
  (`startFromHome`) — never appended to one Instant Resume opened — and it is
  one of the month's conversations like any other. A free account is told so
  under the field: "It counts as one of your 3 free conversations this month —
  3 left."
- A person whose account is older than a week has met Socria, whatever the
  record says, and is not welcomed.
- **Somebody who used Socria before the map** → "We killed the chatbot.",
  once, over the map — see above.

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
