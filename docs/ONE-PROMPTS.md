# When Socria asks

How the product decides to mention Socria One, and why it mostly decides not
to.

The whole system exists to answer one question well: **has this person just
demonstrated that they want more of what they are already doing?** If the
answer is not clearly yes, nothing appears. That is not restraint for its own
sake — Socria's claim is that it is a place to think, and a place to think
cannot also be a place that interrupts you to sell.

---

## How it looks

The prompt is the **/one invitation plate at the scale of an interruption** —
the same Prussian-blue plate and inner rule, the tracked eyebrow, the italic
monogram in its ring, the serif title, the price with its tracked period, the
standfirst voice, the cream pill, and "continue with the free tier" in the
cover's quiet italic. Someone who meets a boundary in Logos and later opens
the Socria One page should recognise the second from the first.

What it drops is the ledger of six capabilities. `SocriaOneModal` keeps that
and is right when someone chose to go and look at One; it is wrong in front of
someone who pressed Explore and found it had stopped. The foot links to the
page that does carry the ledger.

The One page's tokens are **copied** into the `.lg-op-scrim` block in
`app/globals.css`, not imported — `app/one/one.css` is scoped to `.one-root`
and loaded only on that route, and Logos should not pull a whole page's
stylesheet to draw one sheet. If the One palette changes, change both.

Verified in Chromium at 320, 360, 390, 640 and 1280px: bottom sheet flush to
the bottom edge below 640px, centred 452px plate above it, eyebrow on one line
at every width, and with the longest copy in the table it reaches 82% of a
320×640 viewport with the primary action still fully visible.

## The rule

A prompt is shown because of something the **person did**. Never because time
passed, never because they are new, never because a session started.

If you cannot name the action that led to it, there is no prompt.

---

## The pieces

```
lib/one-prompt.ts          the rules. Pure — no React, no storage, no clock.
lib/one-prompt-store.ts    dismissals, per account, in the existing table.
lib/analytics.ts           the one door events go through.
components/useOnePrompt.ts the controller. The only way to raise a prompt.
components/OnePrompt.tsx   the quiet sheet.
app/api/logos/one-prompt/  GET state · POST a dismissal.
```

Nothing opens an upgrade modal directly. A component calls
`ask('explore-spent')` and the controller decides. That indirection is the
point: a modal opened straight from a component is one nobody can rate-limit,
count, or switch off.

**Enforcement is elsewhere and unaffected.** Every limit is held by the API
routes against server-side counters. A prompt is UX. If this whole system were
deleted, not one limit would change.

---

## Two categories

**Entitlement** prompts answer a question the person asked by acting: *why did
that stop?* They appear immediately, and none of the proactive rationing
touches them — no cooldown, no session cap, no engagement bar.

They are shown **once per boundary per tab**, though. The first press of an
exhausted control deserves an answer; the fourth is the same person doing the
same thing, and answering it again with a sheet across the screen is the
nagging the rest of this system exists to prevent. Each trigger is counted
separately: being told the month's chats are gone says nothing about why
Research stopped.

The reason rationing them was once forbidden is real and still holds — silence
would leave someone staring at a button that did nothing. So the surfaces keep
that promise instead. When `ask()` returns `false`, the caller says the same
sentence **in place**: the composer shows it under the box, the node panel
opens on the node that was pressed and says it there, and the allowance meter
carries it for as long as it is true. A press never produces nothing.

**Proactive** prompts answer no question. Nobody asked. Everything that looks
like paranoia below is aimed at these.

## The triggers

| Trigger | Intent | Category |
|---|---|---|
| `chats-spent` `explore-spent` `research-spent` `challenge-spent` `context-spent` `images-spent` `files-spent` | urgent | entitlement |
| `map-full` `depth-locked` `lenses-locked` `draft-locked` `connections-locked` | high | entitlement |
| `returning-thinker` | medium | proactive |
| `asked` (they pressed the Socria One button) | low | — |

Intent orders simultaneous triggers via `bestTrigger()`, so a counter that just
ran out always beats a generic nudge. It never justifies showing one — a high
intent still passes every other rule.

Adding a member to `TRIGGER_REASONS` is the only way to add a prompt. There is
no free-form call.

---

## The one proactive trigger

`returning-thinker` fires on exactly one cue: **a reply just landed**. That is
the only moment where mentioning more room is a continuation rather than an
interruption.

It then has to clear all of this:

- **Engagement.** ≥2 saved Logos sessions, spanning ≥2 distinct local calendar
  days, with ≥5 nodes on the current map. Two sessions in one afternoon is not
  evidence of return. Every one of these is read from data the product already
  stores — no metric was invented to make a number go up.
- **Session cap.** At most one per browser tab, ever.
- **Cooldown.** 7 days after the first dismissal, 14 after the second, 60,
  then 180. The last value repeats, so it cannot wrap back to a short one.
- **Sensitive context.** Suppressed entirely when the map reads the
  conversation as `reflecting` — someone working through something personal.
  Interrupting that to sell a subscription is the most expensive thing this
  system could do, and the extractor already labels it. Entitlement prompts
  are *not* suppressed here: if you press Explore in a reflective conversation
  and it does nothing, silence is worse than an explanation.
- **Never stacks.** Nothing opens while a prompt is already on screen.
- **Never to a member.** Checked first, before anything else can override it.

There is also a ~2.6s settle after the reply lands. That is not a timed
trigger — the trigger already fired — it just keeps the sheet from landing on
top of a reply someone has not finished reading. Typing again cancels it.

### Nothing is generated past a boundary

A refused turn is not extracted from. The map rebuild used to be fired
alongside the reply so the two ran in parallel; that was free when the turn was
accepted and wrong when it was not, because a spent account watched new nodes
appear on every attempt. The extraction now waits for the reply's response
**headers** — not its body — so it still overlaps the whole stream, and a turn
the server refuses never reaches the extractor.

The composer also checks the boundary before sending at all, so a turn that
would begin a chat there is no room for costs no round trip. Continuing an open
line of thinking is never stopped: a chat is counted once, when it starts.

### Dismissal counting

Closing an **entitlement** prompt does not count toward the cooldown. It is a
"not right now" to the thing they were doing, not a "no" to Socria One.
Counting it would let ordinary use of the free tier silence a prompt nobody
ever rejected.

---

## Where state lives

| | holds | why |
|---|---|---|
| `sessionStorage` | prompts shown this tab, and which boundaries were explained | clears itself on tab close, which is what "per session" means |
| `localStorage` | dismissals + when | survives reload, works signed out |
| `logos_usage` (server) | the same, per account | survives a different device |

The server value merges as a **maximum, never the newest**. Dismissals only go
up, so taking the larger can only make us ask less often; a merge that could
lower the count would turn a second device into a way to reset the cooldown.

**No new migration.** Dismissals live in the existing `logos_usage` table under
`scope = 'one-prompt'`, `counter = 'dismissed'` — a count and a timestamp is
exactly that table's shape, and `bump_logos_usage` already makes the increment
race-free. If the table is missing, the route answers `known: false` and the
browser's own memory is used.

---

## Analytics

Five events, all through `lib/analytics.ts` → `@vercel/analytics`:

`one_prompt_shown` · `one_prompt_dismissed` · `one_prompt_clicked` ·
`one_checkout_started` · `one_prompt_suppressed`

Properties: `trigger`, `category`, `intent`, `surface`, `hard_limit`,
`counter`, `plan`, `suppressed`, `dismissals`, `signed_in`.

`scrub()` is an **allow-list**, not a hint. Any other key is dropped; objects,
arrays and functions are dropped even under an allowed key; strings are capped
at 64 characters so a mistake is bounded rather than complete. No message text,
no node labels, no file names, no user id, no email. This is tested directly —
`test/analytics.test.mjs` throws a realistic private sentence at every
plausible key name and asserts none of it survives.

`one_prompt_suppressed` is the most useful of the five. It says how often the
rules are doing their job, and whether a trigger is being starved by them. Read
it before concluding a trigger does not convert.

### What this is for

- Which triggers actually cause upgrades? → `clicked` ÷ `shown`, by `trigger`
- Which prompts are dismissed constantly? → `dismissed` ÷ `shown`, by `trigger`
- Are proactive prompts worth keeping? → compare `category`
- Does a hard limit convert better? → split on `hard_limit`

---

## Tuning it

Everything adjustable is a constant at the top of `lib/one-prompt.ts`:
`COOLDOWN_DAYS`, `PROACTIVE_MIN`, `SENSITIVE_CONTEXTS`, and the `TRIGGERS`
table itself. Limits are never restated — the copy interpolates `{mapNodes}`
from `lib/entitlements`, and every metered boundary is worded once by
`boundaryNote()` there.

---

## Where One is mentioned without being asked for

Besides the prompts, four pieces of chrome say "Socria One" on their own.
None of them is a prompt: each sits still, says the same thing on every visit,
and never animates in. That is the difference between visibility and
interruption, and it is why these can be on every page and the prompts
cannot.

| where | what | who sees it |
|---|---|---|
| model menu, Logos row | a small `One` tag, and a strip under the list: *Logos in full is Socria One* | free only |
| sidebar foot (chat and Logos share it) | the plate: monogram, name, price | free: the price · member: "member" |
| Logos free-tier meter | the counts, then a cream-on-blue *Socria One* | free only |
| /account | the plan block: what you hold, checkout or billing | everyone signed in |

All of it is `components/OneMark.tsx`, drawn in the /one cover's own palette
(`--one-*` tokens on `:root` in `app/globals.css`, which the prompt sheet
now reads too). Each waits for `usePlan().known` before rendering.

What `known` takes depends on who is asking. A **signed-in** visitor waits for
the server, because an account can hold One through Stripe, a grant or a
redeemed code and none of that is visible from the browser — pricing a member
for half a second is a small insult that repeats on every page load. A
**signed-out** visitor waits for nothing: they cannot hold a subscription, and
the one way they hold One is the typed code in `localStorage`, read
synchronously. Making them wait meant that when the round trip did not
arrive — a first visit that meets an auth handshake, a blocked request, a cold
start — they saw no mention of Socria One anywhere on the site, which is the
one audience the caution was not protecting.

## The price is written once

`SOCRIA_ONE.price` in `lib/socria-one.ts` is the source of truth, and
`priceLabel()` / `priceWithPeriod()` render it. Every place that shows the
price — the /one page and its metadata, the Logos landing page, the terms,
the docs, the marks above — goes through one of the two. Change the constant
and everything follows. Do not write the number anywhere else.
