# The developer dashboard

`/dev/dashboard`: who signs up, how far they get through onboarding, which
options they press on the onboarding screen, who they are (in kinds, never
identities), where they came from, and whether they stay.

| | |
|---|---|
| Page | `app/dev/dashboard/page.tsx` (+ `dashboard.css`) |
| Who may see it | `lib/dashboard/gate.ts` |
| Everything it reads | `lib/dashboard/collect.ts` |
| Every number it shows | `lib/dashboard/aggregate.ts` (pure) |
| The page body | `components/dashboard/` |
| The onboarding counters | `app/api/events/route.ts`, `lib/product-events.ts`, `lib/product-event-kinds.ts` |
| Tests | `test/dashboard.test.mjs` (rules, arithmetic), `test/dashboard-e2e.test.mjs` (route, page, 404) |

## Turning it on: two steps, both yours

Nothing below has been done for you. Until step 1 is done, the page is a
404 for everyone. Until step 2 is done, the onboarding counts are not kept.

**1. Decide who may see it, per Vercel environment.** There are two ways in,
and either is enough. Use one or both.

**1a. The two-step code: `SOCRIA_DASHBOARD_CODE_1` and `SOCRIA_DASHBOARD_CODE_2`.**

- Set both, and the page asks anyone not on the admin list for the first
  code, then the second. Nothing is read until both are right.
- Either one unset, or shorter than six characters, turns the codes off. The
  page is then a 404 to everyone not on the list, as before.
- Codes are compared without regard to case or surrounding spaces.
- A right first code gives a signed cookie good for ten minutes. A right
  second code, beside it, gives a pass good for twelve hours. Both are
  httpOnly cookies and neither contains a code.
- Changing either code ends every pass already given.
- Guesses are limited to six a minute and forty a day per account, or per
  address when signed out (`code` in `lib/rate-limit.ts`). This is per
  serverless instance unless Upstash is configured.
- The codes do not require signing in. Anyone who has both can open the page,
  so treat them like a password: share them only in person or privately.
- **Never write the codes into this repository.** It is public. They belong
  only in Vercel's environment variables.

**1b. The admin list: `SOCRIA_DASHBOARD_ADMINS`.**

```
SOCRIA_DASHBOARD_ADMINS=you@yourdomain.com, user_2abc…
```

- With no codes set, **unset or empty means nobody**, including you. Everyone
  else, signed in or not, gets the same 404 as a page that does not exist.
  The page reads nothing for them: no table, and no account but their own.
- A listed person goes straight in, without the codes.
- An entry with an `@` matches only a **verified** address on the signed-in
  account. Clerk lets anyone add an address to their account before it is
  confirmed, so the string alone proves nothing.
- An entry starting `user_` is a Clerk user id. Production and Preview use
  different Clerk instances, so the same person has a different id in each.
  Set the variable separately for each environment.
- Vercel applies environment variable changes to **new** deployments only, so
  redeploy after setting it.

**2. Create the counter table: run the `product_events` part of
`supabase/schema.sql`, then `supabase/rls.sql`, in each Supabase project**
(production, and preview if it has its own). That part is the table and the
`bump_product_event` function. `rls.sql` turns on row-level
security, revokes the table from `anon` and `authenticated`, and limits
executing the function to `service_role`.

Without the table, the page still works. The onboarding-answer and
sign-up-source sections say what is missing, and every beacon is dropped
quietly. **Counting starts when the table exists.** Nothing before that was
kept anywhere the page can read.

## The filter row, and the two kinds of number

One range (7, 30 or 90 days, or all time) scopes everything below the filter
row. It means one of two things:

- **Cohort figures** (the funnel, who they are, did they stay, the recent
  list) are about the accounts **created** in the range.
- **Event figures** (sign-ups over time, onboarding answers, sources,
  rewards) are about what **happened** in the range.

## What each number means

**Headline and tiles**

| | |
|---|---|
| Accounts | Every account in Clerk, all time. |
| New accounts | Accounts created in the range. The arrow compares with the same number of days before it. |
| Active, last 7 / 30 days | Accounts whose last Clerk sign-in or activity, or last conversation update, falls in that window. These are fixed windows and ignore the range. |
| On Socria One | Accounts entitled right now. Each counts once, by the first reason that applies: paying (a live or still-paid-up subscription), then the student month, granted, and a Rewards promo window. The hint shows how many are paying. |
| Newsletter | Accounts that ticked the newsletter box and have not unsubscribed, as a share of all accounts. |

**Sign-ups.** New accounts per day, or per week for all time.

**Onboarding: how far they got** (cohort). Of the accounts created in the
range, how many reached each first-run milestone:

- saw the intro
- wrote a first thought
- first Core experience, and its aha moment
- first Logos model, first manipulation, and Logos's aha moment

It also shows how many skipped the intro, and the median minutes from sign-up
to a first thought. **This is a floor.** Milestones are stored on an account
only once a signed-in browser has synced them, so a step reached on a device
that never synced is missing.

**Onboarding: what they chose** (events). One card per step of the onboarding
screen:

- the name: given, or "rather not say"
- "What do you mostly think about?" (the role)
- "How do you like to think?" (the starting model)
- the first thought's starting point
- whether they used the example

These are counts of **presses, not people**. A browser that blocks the beacon
is not counted, and every count comes from browsers (see Limits).

**Pressed Skip.** The step where people pressed Skip, set against how many
opened the intro.

**Who they are** (cohort).

- Core vs Logos, from their conversations.
- Conversation Style.
- The kind of email address: university, personal provider, work or other,
  none.
- Email domains, only those at least three accounts share.
- Sign-in method.
- Plan.

**Where they came from** (events). The referrer kind, landing page kind and
campaign tag (`utm_source`) of each sign-up, from the first-touch note the
browser kept (`lib/first-touch.ts`).

Visitors from places where that note needs the visitor's own opt-in have no
note, so they appear as **unknown**. Those places are the EU, EEA, UK,
Switzerland, Canada, and anywhere the country is not known
(`lib/newsletter-consent.ts`). Sources therefore under-count those visitors.

**Did they stay** (cohort).

- A histogram of conversations per account.
- **Returned**: of accounts at least two days old, the share with a
  conversation updated 24 hours or more after sign-up.
- The median number of conversations among accounts that have any.

**Rewards.** In the range: referral sign-ups, referral activations and
challenge grants. Also the promo windows open right now.

**Recent sign-ups.** The latest 25 accounts in the range. Each row shows:

- the date
- a public email provider's name, a domain at least three accounts share, or
  otherwise only the kind of address
- the sign-in method
- whether they wrote a first thought
- conversation counts
- plan and newsletter

No row shows a name, an address or an id.

**Data sources.** Each source's state: read, missing, not configured, failed,
or read up to its cap. A capped source's figures are a floor, and the page
says so.

**Notes above the tiles.** The page says when a number rests on partial data:

- Clerk could not be read.
- The counter table is missing.
- A source hit its cap.
- On a preview, the Clerk instance is not the one that wrote the database. The
  joins between the two are then flagged, not silently wrong.

## Privacy: what is read, what is kept

**Read on each visit, by an admin only.**

- From Clerk: sign-up and last-seen times, the sign-in method, and the
  *domain* of the primary address. The address is dropped as soon as it is
  read. Also whether a verified address is at a university, and the three
  Socria One flags.
- From the database: each conversation's owner, kind and two timestamps;
  first-run milestones and Conversation Style; subscription status; newsletter
  rows; Rewards rows; the counters.
- **Never selected**: names, addresses, messages, titles, maps, memory, the
  imported profile or the thinking journey.

So nothing on the page is anyone's reasoning, and the page reads nothing that
could be used to train a model on it.

**What the counter keeps.** One integer per (environment, day, event, kind).
It keeps no user id, no IP address, no session, no device, and no time finer
than the day. There is deliberately no `updated_at`. On a quiet day a row's
count is 1, and the exact moment of its last increment, set beside the
accounts' sign-up times, would say whose answer it was. The page shows answers
only as totals over at least seven days.

The kind is checked on the server against fixed vocabularies: the
onboarding's own role, model and starting-point ids, the surfaces, and the
referrer and landing kinds `lib/first-touch.ts` already uses.

- For the name step, the only kinds are "given" and "skipped". The name itself
  is never sent as a kind.
- The first thought's text is never counted, only which starting point was
  pressed.
- Anything outside the vocabularies is refused. A referrer or landing page
  outside them is counted as `unknown`.

The beacon sets no cookie and stores nothing on the device. It carries the
same scrubbed properties `track()` already sends to Vercel Analytics, and the
server keeps less of them.

## Limits

- **Every count comes from browsers.** Anyone can POST to `/api/events`, so
  the counts are indicative, not audited. Every value comes from a fixed
  vocabulary, so a forger can inflate a count but cannot write text. The
  endpoint has its own rate-limit pool (`count` in `lib/rate-limit.ts`): 30 a
  minute and 300 a day signed in, 20 and 200 signed out. The one open-ended
  value is the campaign tag, which can be any lowercase token of up to 40
  characters, so a made-up tag can appear in the campaigns list. It is shown
  as text.
- **Rate limiting is per serverless instance** unless Upstash is configured
  (`.env.example`, "Rate limiting").
- **Each read stops at a cap**: 20,000 Clerk accounts, and 200,000 rows per
  table. The page says when one is hit.
- **Rows are read on every visit.** That is fine at this size. Past tens of
  thousands of accounts, the page wants a nightly rollup instead.
- **Preview data is not production data.** Each environment counts under its
  own name, and the page shows only its own environment's counts.
