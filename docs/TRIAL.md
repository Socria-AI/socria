# The seven-day trial (Logos 5.5, November 9, 2026)

Socria has no free tier. Every account that is not on Socria One has a **seven-day hard trial**; after it,
every new AI request needs Socria One ($15 a month). Nothing made is ever taken away.

## The rules

| | |
|---|---|
| Begins | With the account's first model call that does real work for it (a reply, a Logic Map pass, an artifact, a reading). Never at sign-up, never for upkeep (a title, the memory kept about the person). |
| Lasts | 7 × 24 hours from that moment, to the millisecond. |
| A day | 00:00 to 24:00 UTC, by the server's clock. 4,000 tokens, input and output together. |
| In all | 28,000 tokens. A day's limit is the smaller of 4,000 and what the trial has left, so a trial that touches eight UTC days (one begun mid-day) still ends at 28,000. |
| A day spent | 429, resting until 00:00 UTC. The screen says when, in UTC and the person's own time. |
| The end | 402 with `trialEnded`. New AI requests need Socria One. |
| After | Every conversation, Logic Map, artifact and document stays open; everything done by hand (moving, writing, renaming, organising, exporting, deleting) works. Only requests that would ask a model are refused. |
| Socria One | Never counted, never refused for a trial. Subscribing mid-trial simply leaves it. |

The numbers live in `lib/trial.ts` (`TRIAL`); `SOCRIA_TRIAL_DAILY_TOKENS` and `SOCRIA_TRIAL_TOTAL_TOKENS` move
them per deployment. `SOCRIA_SLEEP=off` still switches all counting off (an operator's switch for an incident).

## What Socria One alone has

No daily limit, Socria Voice, sharing a chat, the experiments (Use your hands, AR Mode, big-screen mode, and
Live Guidance with it), and the Celestial and Socria One themes; files up to 30 MB and more memory carried
between conversations. Voice, sharing and Live Guidance are refused on the server (`hasFeature`); the hands,
AR Mode and big-screen mode run in the browser and are locked in the app's menus (the ways out — stopping the
hands, leaving big-screen mode — always work); the themes fall back to Paper (`lib/theme.ts`).

## Enforcement

One gate, server-side, on every route that calls a model for a person (`lib/sleep-server.ts sleepGate`;
the suite `test/trial.test.mjs` fails if a model-calling route skips it):

1. Signed out → the guest rules (`lib/guest-pass.ts`). Socria One or `SOCRIA_SLEEP=off` → through, uncounted.
2. The trial read from the store (fail closed: unreadable → 503, nothing given away uncounted).
3. Ended → 402 (and a `socria_trial_over` cookie, so the browser's guest preview cannot stand in for it).
4. Today spent → 429 with the day's state.
5. Otherwise the request is metered: every model call in it is **held** before it is made (its estimated
   input × 1.2 plus the most it may write) and **settled** after at what it really cost
   (`lib/token-allowance.ts`). The request's first call begins the trial (`beginTrial`).

Why it cannot be bypassed: the balance is the server's, keyed by the account and the UTC day — never a
cookie, header, body field or browser. Holds are taken under the row's lock (`reserve_logos_tokens`, or
`consume_logos_usage` until `supabase/weekly-tokens.sql` is applied), so refreshes, tabs, devices and
requests at once draw on one balance and can never be granted the same last tokens.

Without those functions (a database where `supabase/freemium.sql` was never run, or where they answer an
error), every trial write is made on the table alone (`lib/usage-rows.ts`), as strictly: the start with
INSERT … ON CONFLICT DO NOTHING (one first message begins the trial, however many arrive at once), and
every count changed only where it is still the value read (compare-and-set: of twenty requests racing for
the last 1,000 tokens, exactly the ones that fit are given them). The functions are used wherever they
answer. Only a store that cannot be read or written at all pauses requests (503). Until November 9, 2026
the start was written only through `consume_logos_usage`, and production — which did not have it —
answered every trial's first message with "Your trial can't be checked right now". A failed call costs
nothing; a call that used less than it held gives the rest back; a stream stopped early is settled at an
estimate of what it read and wrote; a settle is counted once; a hold whose call never returns stops
counting after ten minutes. The day may end past its limit by at most the one call that was running.

### Metering rules

- Counted: the input the provider read afresh plus everything it wrote (reasoning included). Input served
  from the prompt cache is not counted.
- Images: held at 1,500 tokens each (100 at low detail), settled at what the provider reports.
- Web search: counted where what it found is read (the reply or the Explore panel it feeds).
- Not counted: our own work — a failed attempt, a second attempt after our own check, a title, the memory,
  Core's state/guard/checker. Upkeep routes stand down while the trial is resting or over.
- Voice (transcription) is Socria One's, so a trial never transcribes.

## One trial a person

When a trial begins, an HMAC-SHA256 of each verified email address on the account, normalised (lower case,
`+tag` dropped, Gmail dots dropped, googlemail → gmail), is kept in the usage table under
`trialclaim:<hex>` — never the address. It is keyed by the hash, so deleting the account leaves it. A new
account whose verified address matches starts with its trial ended (`reason: 'claimed'`). Key:
`SOCRIA_TRIAL_SECRET`, else derived from `CLERK_SECRET_KEY`; with neither, no check is made. A different
address is a different person to us. The privacy policy and terms say so (both need legal review).

## Migration (decided November 9, 2026)

Every account that was on the old free plan simply has no trial yet: its trial begins at its next real
request, like a new account's. Nobody is cut off at deploy. Paid subscribers are untouched. The old week's
token rows are no longer read by the gate (kept, not deleted).

## Guests

The signed-out preview stays (one line of thinking, five messages, its own pass). It is closed on a browser
whose account's trial has ended (the cookie above).

## Billing

Socria One is decided on the server from the Stripe subscription (`lib/socria-one-server.ts`): `active`,
`trialing` and `past_due` (a failed card while Stripe retries) entitle; `unpaid`, `incomplete` and `paused`
do not; a cancelled subscription entitles until its period ends. The webhook clears the plan memo the moment
a payment lands, so access is immediate on the instance that took it and within 30 seconds elsewhere.

## Analytics

`/dev/trial` — off production only, and only for the owner's account (matched by the permanent grant's hash)
or someone named in `SOCRIA_DASHBOARD_ADMINS`. Trials begun and running, upgrades (in a trial, after one,
without one), conversion, days a limit was reached, trials ended, tokens spent and their estimated cost
(`SOCRIA_COST_PER_MTOK`, default $2 a million), and a line a day. Counts carry no person: they live in the
service's own rows (`metrics:trial`, `mday:MM-DD`); events are counted once per person by marker rows.

## Deployment

- No migration is required: everything is in `logos_usage`, and nothing needs its functions (they are used
  where they exist; `/api/health/upstream` says whether they do).
- Recommended: run `supabase/freemium.sql` once, so holds and counts are taken under the row's lock by the
  functions rather than by compare-and-set (both are strict; the functions are one round trip).
- Recommended: apply `supabase/weekly-tokens.sql` (not applied yet, by decision) so holds are kept apart from
  the day's total.
- Set `SOCRIA_TRIAL_SECRET` (a long random string) so the eligibility hash does not depend on the Clerk key.
- Legal review of the privacy policy and terms changes before production.
