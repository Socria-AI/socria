# Freemium — the Free plan and Socria One (October 2026)

Logos 5 relaunches with a strict free plan and one paid plan. This page is the
record of what changed, how each limit is counted and enforced, the one manual
step production needs, and the decisions and known boundaries.

Every number below lives in one table, `PLANS` in `lib/entitlements.ts`. The
pages, the paywall, the FAQ, the docs and the emails read it — nothing states a
number of its own — so a limit changes in one place.

## The plans

| | Free | Socria One — $15/month |
|---|---|---|
| Conversations | 10 a month | Unlimited (fair use: 400) |
| Logic Maps | 2 a month | Unlimited |
| Logic Map nodes | 10 a month | Unlimited |
| Artifacts | 2 a month | Unlimited |
| Documents | 1 a month | Unlimited |
| Socria Voice | Not included | Included |
| Sharing a chat | Not included | Included |

Months are calendar months, UTC. Messages are not counted on either plan. The
fair-use ceilings both plans share (Research runs, images and files read per
conversation) are unchanged and are never sold past.

A signed-out guest has their own smaller pass (`lib/guest-limits.ts`: five
messages and one map in one conversation, kept in the browser). Signing up
brings that conversation along.

## What was removed

Socria One is paid for, or it is not held. Everything that granted it otherwise
is retired; the data it wrote is kept and simply no longer read as a grant.

| Retired | Where | Now |
|---|---|---|
| Typed Socria One codes | `/api/logos/redeem`, access cookie `one` scope | 410 "Codes for Socria One are no longer offered"; the cookie opens the site, never the plan |
| Complimentary grants and comped emails | `lib/socria-one-grant.ts`, `lib/entitlement-rule.ts` (`comp` status) | Not read as a grant; rows and metadata kept |
| UTA student month | `lib/socria-edu.ts`, `/students`, account panels | `studentOfferOpen` and `eduProgrammeOn` answer no; `/students` says it has ended (noindex, out of the sitemap) |
| Socria Rewards days | `lib/rewards/*`, `lib/socria-one-server.ts` | Off unless `REWARDS_ENABLED=1`; promotional time is not read by the plan |
| Stripe promotion codes | `app/api/stripe/checkout` | `allow_promotion_codes: false` |
| The free first thought from onboarding | `app/api/logos/chat`, `lib/usage.ts` | Counted like any conversation |
| The daily message cap | `PLANS.free.counters.messages` | `null` on both plans |
| One shared chat on Free | `lib/share/roles.ts` | `FREE_SHARED_CHATS = 0`; sharing is Socria One |
| Legacy Core counters | `app/api/chat` | The archived Core chat counts `chats` like Logos 5 |
| Promotional copy | landing, /one, account, FAQ, docs, emails, OG cards, newsletter | Rewritten from the table; the student and rewards newsletter issues are drafts marked "never approve" |

The operator allowlist, `SOCRIA_ONE_USER_IDS`, stays: it is environment
configuration for the team's own accounts, not an offer.

## How each limit is counted

Each thing is charged once, when it is made, and never twice: a marker row
beside the month's count remembers it (`lib/quota.ts` `claimUnit`), so a
retried turn, a redrawn map or an artifact saved again costs nothing.

| Counter | One unit is | Charged at | Marker |
|---|---|---|---|
| `chats` | a conversation, when it is started | `app/api/logos/chat` (and the archived `app/api/chat`), after the pre-check, at the charge point | `chatmark:<session>` |
| `maps` | a conversation's Logic Map, the first time it gains a node — by a map pass or by hand | `app/api/logos/map`; `app/api/logos/allowance` (`newMap`) for a map begun by hand | `mapmark:<session>` |
| `nodes` | a node a map gains | `app/api/logos/map` (`consume`, `upTo`: a pass keeps the nodes there is room for); `app/api/logos/allowance` for nodes added by hand | — |
| `artifacts` | a workspace object, a built model, or a conversation's first picture | `app/api/logos/map`, and `app/api/conversations` PUT for artifacts made in the browser | `artmark:<session>:obj:<id>` etc. |
| `documents` | a document whose reading first reaches a conversation, or a write-up filed in Content | `app/api/logos/chat`, `app/api/files/read` | `docmark:<id>` |

Whether a conversation already has its map is the server's to say — its
`mapmark:` row, or a saved map with nodes (`savedMapHasNodes` in `lib/quota.ts`)
— never what the browser sends. A free map pass that names no conversation
has none to already have a map, so each one that leaves a map is counted as a
new map; and a map the browser owes from an earlier turn is redrawn only for
Socria One.

At a limit the route answers `402` with `{ error, upgrade: <counter>, used, limit }`,
before any model call where it can be known in advance. If the free plan cannot
be counted at all (the `logos_usage` table is missing), its monthly allowances
answer `503 { error, unavailable: true }` instead of running uncounted — "starting
new conversations, maps, artifacts and documents is paused", everything already
made stays open — and Socria One is never paused. Two exceptions keep the
words coming: a write-up refused for documents is answered in the conversation
instead (`X-Socria-Limit: documents`), and a map pass that would exceed nodes
keeps what fits and returns `limit`. Nothing already made is ever removed —
`lib/quota-map.ts` only takes back what the refused pass would have added.

Socria Voice (`app/api/transcribe`, both the voice conversation and hold-to-talk)
answers `402 { upgrade: 'voice' }` for a free account before reading the audio.
Opening a share (`app/api/share`: invitation, link, code, reset) answers
`402 { upgrade: 'share' }`; joining what someone else shares stays free, and a
door a free owner opened before the change stays open.

## What the person sees

- **The paywall** (`components/SocriaOneModal.tsx`): "You’ve reached your free
  limit.", the counter's own sentence (`boundaryNote`), the Free / Socria One
  comparison (`comparisonRows`), "Upgrade to Socria One — $15/month", and "Not
  now — keep the free plan".
- **The prompt sheet** (`components/OnePrompt.tsx`, triggers in
  `lib/one-prompt.ts`): one trigger per counter (`chats-spent`, `maps-spent`,
  `nodes-spent`, `artifacts-spent`, `documents-spent`) and per feature
  (`voice-locked`, `share-locked`), with a usage meter.
- Both sheets are drawn in Logos 5's own paper (`components/one/one-sheet.css`):
  the surface, serif and hairlines of every other sheet, a bottom sheet on a
  phone, with Socria One's blue kept for the monogram, the One column and the
  button that buys it. Their buttons are the product's button language
  (`components/logos5/buttons.css`).
- **The Logic Map, once the month's maps are used**: a conversation with no map
  shows what happened and that it carries on ("You’ve used this month’s free
  Logic Maps."), the date they start again, and "See Socria One" — not a "Map
  this conversation" button the server would refuse.
- **The usage panel** in Logos 5 shows each monthly allowance, and a quiet
  near-limit note on the last two of ten or the last one of a small allowance
  (`nearLimit`). Never a countdown.
- **Voice** shows a locked button with a "One" badge for a free account; the
  composer's dictation mic is Socria One only.
- **Pages**: the landing plans, /one (six chapters, each Free beside One),
  the account sheet, the FAQ, the docs plan table, the terms, the OG cards and
  the welcome and limit emails all read the same table.

## Production: the one manual step

Run `supabase/freemium.sql` in the Supabase SQL Editor. It is safe to run more
than once and changes no existing row: it creates the `logos_usage` table and
its index if they are missing (row-level security on, as the service role is
the only reader), adds a non-negative check (`NOT VALID`, so old rows are not
scanned), and the counting functions — `bump_logos_usage`,
`consume_logos_usage`, `refund_logos_usage`, `claim_logos_unit`,
`release_logos_unit`.

- **Without the functions**, the code still counts through the older
  read-then-bump path and logs a warning once per instance. That is correct
  except when two requests race for the last unit of an allowance.
- **Without the `logos_usage` table**, the free plan's monthly allowances pause
  (`503 unavailable`) rather than run uncounted, and that is logged as an error.
  This is what let free accounts past their maps and conversations before: the
  table was missing, and the old rule failed open. Socria One is never paused,
  and a transient database error still fails open.

Check after deploying: `GET /api/health/upstream` reports
`usage: { table: true, functions: true }`; a free test account's third Logic Map
in a month answers 402, as does its eleventh conversation; the server log shows
no `[quota]` warning.

## Stripe

- Checkout sells exactly one price, `STRIPE_PRICE_SOCRIA_ONE`, chosen on the
  server; the client never names a price. Promotion codes are off.
- `GET /api/stripe/diagnose` (operators) now also checks that the configured
  price is a recurring $15 a month (`priceMatchesPlan` in
  `lib/stripe-diagnosis.ts`).
- The signed webhook is the only writer of subscription state. Statuses
  `active`, `trialing` and `past_due` entitle; `comp` no longer does; a
  cancelled subscription keeps access to the end of the paid period.
- Existing paid subscriptions are untouched: same price, same rows, same
  entitlement.

## Decisions and known boundaries

- **Comped and student accounts lose Socria One.** Anyone who held it by a
  code, a comp, a student month or a reward is on the free plan from the next
  request, with everything they made intact. An account that should keep it
  without paying goes in `SOCRIA_ONE_USER_IDS`.
- **Nodes added by hand** are counted through `POST /api/logos/allowance`
  before the browser applies them; the first node of a conversation's map claims
  that conversation's map there too, so a map begun by hand counts like one
  drawn by Socria. A conversation saved through
  `PUT /api/conversations` re-checks new artifacts on the server, but not new
  nodes: a client that skipped the allowance call could save hand-made nodes
  uncounted. Map passes — where nodes are actually made — are fully held on the
  server.
- **Socria One's conversations** have a fair-use ceiling of 400 a month, set far
  past any person's month; if it is ever met, the note says it is fair use and
  offers nothing.
- **The daily message cap is gone** on both plans, as the new plan specifies.
- **Joining a share is free**, and a guest's turn in someone else's shared
  conversation is never charged to either side.
- **Dictation** (hold-to-talk) is part of Socria Voice and is Socria One only.

## Rollback

The numbers are one table: changing `PLANS.free.counters` (or a feature flag in
`PLANS.free.features`) changes every surface and every route together. The SQL
functions can stay in place either way. Re-opening a retired grant (codes,
comps, the student month, Rewards) is a code change, deliberately — each was
removed at its source, not hidden.

## Tests

`test/free-limits-e2e.test.mjs` drives every limit through the real routes
(fake Supabase, Clerk, OpenAI and Stripe). The plan and its copy are pinned in
`entitlements`, `usage-scope`, `one-prompt`, `billing`, `share-roles`,
`share-e2e`, `stripe-webhook-e2e`, `route-boundary`, `support-faq`, `seo`,
`lifecycle`, `newsletter-consent`, `edu`, `rewards`, `rewards-wiring`,
`onboarding` and `logos4-capture-voice`.
