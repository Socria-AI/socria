# Socria Rewards

> **Create 5 nodes. Get 7 days free.**
> **Invite a friend. Give 7 days. Get 7 days.**

Two incentives, one engine. Every reward is a number of days of Socria One,
decided and granted on the server, recorded once, and layered over whatever the
person already holds. Paid access is never touched.

## The two offers

### The 5-Node Challenge

Create one Logos mind map with at least five meaningful, connected nodes and
unlock seven days of Socria One. It's meant to be an easy way into Logos, not
an assignment:
- no card;
- no waiting period;
- no minimum branches, counterarguments or length;
- no sharing.

Each account can complete it once. Existing maps count, so someone who already
built one is granted the reward on their first visit. It's open to accounts
without Socria One. Paying, complimentary and student members are told there's
nothing to unlock.

**What counts** is decided from the map as the server stored it
(`conversations.map` and `conversations.messages`), never from anything the
browser reports. The rule is in `lib/rewards/challenge-rule.ts`:

- **Meaningful.** The label has real content: at least two letters, or a line of
  working such as `2x + 6 = 14`.
  - Placeholders don't count: "New node", "Untitled", "Idea 3", "TBD" and the
    like.
  - Duplicates count once. Labels are compared after folding case, punctuation
    and a trailing number, so five copies of one thought are one node.
- **Connected.** The five sit in one connected piece of the map, using Logos's
  own edges in either direction. The central node is a node like any other and
  counts.
- **Theirs.** Logos draws the map *from the conversation*, so the person's part
  is what they said.
  - Nodes count when they came from the person (no `origin`) or are Socria
    suggestions they chose to keep (`origin: 'socria'`).
  - Attached material (`source`) and engine-computed nodes (`computed`) can
    connect the map but don't count toward the five.
  - The session must also hold at least `REWARDS_CHALLENGE_MIN_WORDS` (5) words
    the person wrote. A starter card sent unchanged isn't their words; an
    edited one is. This blocks completion by one click on a built-in opening
    while asking almost nothing of anyone actually thinking.

There's no model call and no expensive evaluation: one read of the person's
most recent `REWARDS_CHALLENGE_SCAN` (60) Logos sessions.

### Give 7, Get 7

1. Everyone gets a referral link, `/r/<code>`, as soon as their account
   exists. The code is 8 characters from an alphabet with nothing to misread,
   and names no one.
2. A friend opens the link. An httpOnly cookie remembers the code and when the
   link was opened. **First link wins**: a later link doesn't take a friend
   from whoever brought them. The sign-up page says "A friend invited you" and
   promises the seven days only for a code someone actually holds; a mistyped
   link, or any link while the rewards tables are missing, lands on the
   ordinary sign-up page.
3. The friend creates an account. On their first visit (`POST /api/rewards`)
   the server checks they're a **genuinely new** account:
   - created within `REWARDS_NEW_ACCOUNT_HOURS` (72) hours;
   - created after the link was opened;
   - has a verified email that isn't a disposable inbox;
   - isn't the referrer's own address in disguise (Gmail dots, `+tags`);
   - isn't the referrer themselves;
   - isn't already referred.

   If all checks pass, the friend gets **7 days** at once.
4. When the friend has had **two meaningful sessions**, the referrer gets **7
   days**. A meaningful session is a Core or Logos conversation with at least
   two messages of the friend's own words, a dozen words in all, and a reply
   from Socria. Page visits and opening Logos never count.
5. **Direct only.** A → B → C pays B for C and pays A nothing for C. Chains are
   unlimited, and everyone can refer from the moment they join, however they
   arrived.

Limits:
- **4** rewarded referrals per person per calendar month (UTC);
- at most **30** days of promotional time waiting at once;
- no limit on chain depth.

All of these are configurable (see Configuration).

## Where it shows

**Rewards stack.** Do both, the challenge and a friend who starts using
Socria, and that's 7 + 7 = 14 days of Socria One, one after the other. Each
reward extends the window from where it ends, never from now (promo-engine
rule 2), and no more than `REWARDS_BANK_CAP_DAYS` (30) can be waiting at once
(rule 3). `test/rewards.test.mjs` pins it through the service, in both orders:
"do both: the challenge and a friend stack, end to end". The popups say so,
with the sum and the cap; they don't decide it.

**The marks.** Two small marks sit beside the Socria mark at the top of the
rail, on Core and in Logos (`components/rewards/RewardsBadges.tsx`):

- a gift for Give 7, Get 7, while the person has a link to give;
- a five-node ring for the 5-Node Challenge while it's open to them. The ring
  fills with their progress.

They're the one loud thing in a quiet rail: 24px buttons with a turning ring,
a glint and a sparkle. All of that motion stops under reduced motion. Signed
out, or with Rewards off, there are no marks. A completed challenge, or a
member it can't help, loses its mark.

In Logos, the header's challenge chip (`ChallengeChip`) shows progress only
while the rail is put away, so the challenge is never said twice on one
screen. It still says the completion.

**The popups** (`components/rewards/RewardsPopups.tsx`) are a plate in the
family of the Socria One invitation, deep moss and gold instead of Prussian
blue, each with a picture:

- **Give 7, Get 7.** Two gifts, one going each way. Below them, the person's
  link with Copy, the stacking line, and the fine print: the activation rule,
  the monthly limit, and what happens to a member's days.
- **The 5-Node Challenge.** A small map lit as far as their best map has come,
  progress as the server counted it, and the way into Logos. From Core the
  button opens the newest Logos on offer; in Logos it goes back to the map.
- **Complete.** On Core only (Logos has its chip), once per browser, in the
  answer that granted it.

A popup opens in one of three ways:

1. **A mark is pressed.** It opens at once and is never rationed.
2. **The challenge completes** (Core).
3. **The person arrives.** This is decided in `lib/rewards/popup-rule.ts`,
   which is pure and tested:
   - **Once a visit at most.** The decision is made once per tab session
     (sessionStorage). If the visit can't be remembered, nothing opens by
     itself.
   - **Rarely.** Never two within 20 hours of each other. The same one no
     sooner than 3 days. "Not now" rests it 10 days, and doing what it asked
     (copying the link, opening Logos) rests it 14.
   - **They take turns.** The one shown longest ago goes first. Of two never
     shown, the challenge goes first.
   - **Only into a quiet room.** It waits until everything is known and the
     page is settled. It doesn't open if the One invitation, the tour or
     onboarding's first exchange has spoken this visit. It never opens over
     an open dialog (`[aria-modal="true"]`), the tour or Find.

The memory is this browser's (`socria.rewards.popup.v1`) and holds times only.
Like every `socria.` key, it's swept on sign-out. No countdowns, streaks or
"only today", the same as everywhere else Rewards appears.

## Architecture

```
lib/rewards/
  rewards-config.ts        every number, from the environment, validated and clamped
  promo-engine.ts          PURE: what a reward does to a promotional account
  challenge-rule.ts        PURE: what counts as five nodes
  referral-rule.ts         PURE: codes, the link cookie, who is a new friend, "active"
  rewards-store.ts         the storage contract + an in-memory implementation
  rewards-service.ts       the rules run against a store, idempotently, race-free
  supabase-rewards-store.ts  the contract on Postgres (server-only)
  promo-access.ts          the read-only question the plan resolver asks
  rewards-server.ts        deps, loaders, identity facts, cookies, invitations
app/api/rewards/route.ts           POST: attribute, check, grant, report (the one sync)
app/api/rewards/invite/route.ts    POST: a signed-out person opened a Think Together room link
app/r/[code]/route.ts              GET: the referral link
app/api/cron/rewards/route.ts      GET: daily sweep (CRON_SECRET)
components/rewards/                useRewards, ChallengeChip (Logos), RewardsPanel (account), RewardsSync,
                                   RewardsBadges (the rail's marks), RewardsPopups (the popups)
lib/rewards/popup-rule.ts          PURE: when a popup may open by itself
```

### Data

Four tables, in `supabase/schema.sql` under "Socria Rewards", walled in
`supabase/rls.sql` (RLS forced, no policies, grants revoked):

| table | key | holds |
|---|---|---|
| `promo_ledger` | `key` (`challenge:<user>`, `referral_signup:<user>`, `referral_activation:<referred>`) | one row per reward, for all time: source, recipient, award time, days, what was actually applied after the cap, when its window ends, outcome |
| `promo_accounts` | `user_id` | `promo_until`, `banked_ms`, the keys already applied, the month's referral counter, `version` |
| `referral_codes` | `user_id` (code unique) | the person's code |
| `referrals` | `user_id` (the **invited** person) | referrer, code, `via` (`link` / `invite`), status, when they became active |

### Promotional access over paid access

The engine's rules are pinned in `test/rewards.test.mjs`.

1. **Paid access is never touched.** Promotional time is a layer over Stripe,
   complimentary and student access. While the person holds any of those, a
   reward is **banked**: saved, not started. It starts when their own access
   ends. Stripe is never called.
2. **Rewards stack end to end.** A reward extends running time from where it
   ends, not from now.
3. **Nothing exceeds the cap.** Time still to come (what's left of the window
   plus the bank) never passes `REWARDS_BANK_CAP_DAYS`. A reward that would
   cross it is trimmed to fit, and the trim is recorded.
4. **Each reward applies once.** Each reward has a key unique for all time. The
   keys already applied live on the account row itself, the same row whose
   update is atomic.
5. **The monthly referral limit** is checked and spent in that same atomic
   write. A full bank doesn't spend a month's slot.
6. **Paying mid-reward loses nothing.** Running time pauses into the bank when
   the Stripe webhook reports a live subscription, and resumes if the paid
   access ever ends.
7. **Expiry is automatic.** Promotional access is "until" a moment. Its ending
   is reported once (`expiredFor`) for analytics.

The plan resolver (`lib/socria-one-server.ts`) asks about promotional time
**only after** paid, complimentary, student, allowlisted and typed-code access
have all said no. So promotional access can never stand in front of paid
access, and its expiry can never remove it. That per-request check is
read-only. The writes that change the answer happen in three places:
- `POST /api/rewards`: starting banked time, pausing running time, reporting an
  ending;
- the Stripe webhook;
- the daily cron.

### Idempotency and concurrency

A grant works in two steps:
1. Insert the ledger row. Its primary key is the reward key, so of two racing
   inserts exactly one succeeds.
2. Compare-and-swap the account: `update … where version = N`. The account
   remembers the keys it applied.

The outcomes:
- **Retries, double clicks, two tabs, two servers:** one application.
- **A grant that died half-way** (ledger written, account not): finished by the
  next request that touches the person, or by the cron.
- **A grant that died after the account write:** recognised by its key and
  never applied twice.
- **A caller that didn't apply the reward** only settles a ledger row still
  marked `pending`. It can't overwrite the real outcome.

The suite runs these paths against a store that interleaves every operation at
random. 25 concurrent claims of one reward, 8 different rewards at once
against the cap, and 10 activations against the monthly limit all hold. It
passed 40 of 40 randomised runs.

### When someone can't be told apart from a paying member

`baseEntitledForRewards` answers **yes** whenever it can't be sure (an
unreachable database or identity provider). The worst that does is keep a
reward banked a little longer. Answering no could start someone's banked days
while they're in fact paying.

## Billing

- **Stripe is never touched.** No billing dates, trials, credits or prices are
  changed. A reward to a paying member is banked in our own table.
- **Checkout still sells to someone on a reward.** The "already a member"
  refusal uses `resolveBasePlanForRequest`. Without that, nobody on a reward
  could ever convert.
- **The /one page and the account sheet** say "from Socria Rewards, N days
  left" and keep the subscribe path. A reward is never cached in the browser
  as a membership.
- **Conversion:** when the webhook reports a live subscription for someone a
  reward reached, `converted_at` is set once and `rewards_promo_converted` is
  sent.

**Flagged for your decision, not built:**
- **A Stripe trial instead of a bank.** Starting a new subscription with
  `trial_end = promo_until` would honour reward days through Stripe itself. It
  changes billing dates, so it needs your approval and a Checkout change.
- **Credits on the invoice.** Converting banked days into Stripe customer
  balance for paying members is possible, and it's a billing change.

## Abuse prevention, and what's left

**In place:**
- **Server-side only.** Grants happen only on the server, from authenticated,
  rate-limited routes.
- **The cookie.** It's httpOnly, and only a code that exists is remembered.
- **New-account rules:** the 72-hour window, "created after the link was
  opened", a verified email, and no disposable domains (a built-in list plus
  `REWARDS_BLOCKED_EMAIL_DOMAINS`).
- **Same-person checks:** self-referral and the referrer's own address in
  another form are refused.
- **In the database:** one referrer per account (primary key), and no
  self-referral even by hand (a check constraint).
- **Activation needs real use:** two meaningful sessions in the friend's own
  words with Socria's replies, so each referral costs real effort.
- **Bounds:** 4 rewarded referrals a month and a 30-day bank cap limit what any
  one account can accumulate.

**Remaining risk.** Someone who makes fresh email accounts and has two real
conversations in each can earn up to 28 days a month. The program can't
prevent this without collecting more personal data than Socria does.
Options, strongest first:
1. Require two distinct days of activity (`REWARDS_ACTIVATION_DISTINCT_DAYS=2`).
2. Lower the monthly cap.
3. Hold referral rewards for review above a velocity threshold.
4. Phone or payment-method verification for referrers. This is a product and
   privacy decision.

**Account deletion** removes everything, including the deleted person's id from
the rows of people they invited. Deleting and re-creating an account with the
same email therefore makes it eligible again. Keeping hashed identities to
prevent that would outlive the deletion promise, so it isn't done.

## Think Together

Think Together keeps its name, its invitations and its permissions. Rewards
only adds memory of who invited someone:
- **Room links** (`/chat?model=logos-3&join=…`): a signed-out visitor's Logos
  asks `/api/rewards/invite` to remember the room's host.
- **Share links, codes and emailed invitations:** `/api/share/accept` already
  answers a signed-out visitor with 401. It now also remembers the share's
  owner on that response (read-only lookup, rate-limited).

If that visitor creates an account, the inviter is their referrer, exactly as
with a link, and `referrals.via` records `invite`. Signed in, nothing changes.
An existing account is never "new".

## Analytics

All events are shape only: a `kind` (`challenge` / `referral_signup` /
`referral_activation`), an `outcome` (`active` / `banked` / `bank_full` /
`monthly_cap`), and a `surface` (`link` / `invite` / `logos` / `account`).
Never a code, an id, a name or an address.

| event | sent from |
|---|---|
| `rewards_challenge_viewed` | the Logos chip, first time shown in a browser |
| `rewards_challenge_started` | the Logos chip, first time progress > 0 |
| `rewards_challenge_completed` | server, when qualification is first met |
| `rewards_challenge_reward_granted` | server, with `outcome` |
| `rewards_referral_link_copied` | the account panel (`surface: account`) or the Give 7 popup (`popup`) |
| `rewards_popup_viewed` | a popup opened: `kind` (`give` / `challenge`), `trigger` (`visit` / `icon`), `surface` |
| `rewards_popup_dismissed` | closed without acting: the same, with `outcome` (`closed` / `not_now`) |
| `rewards_referral_link_opened` | server, `/r/<code>` or an invitation (`surface`) |
| `rewards_referral_signup_completed` | server, on attribution (`surface`) |
| `rewards_referral_activation_completed` | server, once per friend |
| `rewards_referral_reward_granted` | server, `kind` = signup or activation, with `outcome` |
| `rewards_promo_expired` | server, once per window |
| `rewards_promo_converted` | server (Stripe webhook), once per person |

## Measuring it

These run against Supabase (SQL Editor). Times are epoch ms. Rates that need a
denominator only analytics has (views, link opens) combine the two.

```sql
-- Challenge completions per week
select date_trunc('week', to_timestamp(created_at / 1000)) as week, count(*) as completed
from promo_ledger where source = 'challenge' group by 1 order by 1;

-- Challenge completion rate among people who used Logos in the last 30 days
with logos_users as (
  select distinct user_id from conversations
  where kind = 'logos' and created_at > now() - interval '30 days')
select count(p.key)::float / nullif((select count(*) from logos_users), 0) as completion_rate
from promo_ledger p join logos_users l using (user_id) where p.source = 'challenge';

-- Referral sign-ups per week (÷ rewards_referral_link_opened from analytics = sign-up conversion)
select date_trunc('week', to_timestamp(created_at / 1000)) as week, via, count(*) as signups
from referrals group by 1, 2 order by 1;

-- Referred-user activation rate (friends at least 14 days in)
select count(*) filter (where status in ('rewarded', 'capped', 'bank_full'))::float / nullif(count(*), 0) as activation_rate
from referrals where created_at < (extract(epoch from now()) * 1000 - 14 * 86400000);

-- Average direct referrals per active user (last 30 days)
with active as (select distinct user_id from conversations where updated_at > extract(epoch from now()) * 1000 - 30 * 86400000)
select (select count(*) from referrals where created_at > extract(epoch from now()) * 1000 - 30 * 86400000)::float
     / nullif((select count(*) from active), 0) as referrals_per_active_user;

-- Referral-driven growth: share of new people (first conversation in the window) who were referred
with firsts as (select user_id, min(created_at) as first_at from conversations group by user_id),
     newcomers as (select user_id from firsts where first_at > now() - interval '30 days')
select count(r.user_id)::float / nullif(count(n.user_id), 0) as referred_share
from newcomers n left join referrals r using (user_id);

-- Promotional-to-paid conversion
select count(*) filter (where converted_at is not null)::float / nullif(count(*), 0) as promo_to_paid
from promo_accounts where jsonb_array_length(applied) > 0;

-- 7- and 30-day retention of reward recipients (any conversation touched N+ days after their first reward)
with first_reward as (select user_id, min(created_at) as at from promo_ledger group by user_id)
select
  avg((exists (select 1 from conversations c where c.user_id = f.user_id and c.updated_at >= f.at + 7 * 86400000))::int) as d7,
  avg((exists (select 1 from conversations c where c.user_id = f.user_id and c.updated_at >= f.at + 30 * 86400000))::int) as d30
from first_reward f where f.at < extract(epoch from now()) * 1000 - 30 * 86400000;

-- Estimated promotional inference cost: Socria's replies in conversations active during a
-- reward window, for people with no paid subscription, × your cost per reply ($0.01 here)
with promo_only as (
  select a.user_id, l.created_at as from_ms, coalesce(a.promo_until, l.created_at) as to_ms
  from promo_accounts a join promo_ledger l using (user_id)
  where not exists (select 1 from socria_subscriptions s where s.user_id = a.user_id and s.status in ('active', 'trialing', 'past_due')))
select count(*) as replies, count(*) * 0.01 as est_usd
from promo_only p join conversations c on c.user_id = p.user_id and c.updated_at between p.from_ms and p.to_ms,
     jsonb_array_elements(c.messages) m
where m->>'role' = 'assistant';
```

The cost estimate is an upper bound for the window. It counts every reply in a
conversation touched during the reward, including replies written before it
began. For an exact figure, add per-turn token logging, which Socria doesn't
keep today.

## Configuration

All optional. These defaults are the offer as written.

| variable | default | meaning |
|---|---|---|
| `REWARDS_ENABLED` | on outside production; **off in production** | `1` turns it on, `0` turns it off anywhere |
| `REWARDS_CHALLENGE_NODES` | 5 | nodes in one connected map |
| `REWARDS_CHALLENGE_DAYS` | 7 | days for completing it |
| `REWARDS_CHALLENGE_MIN_WORDS` | 5 | own words required in that session |
| `REWARDS_CHALLENGE_SCAN` | 60 | most recent Logos sessions examined |
| `REWARDS_REFERRAL_SIGNUP_DAYS` | 7 | the friend's days |
| `REWARDS_REFERRAL_ACTIVATION_DAYS` | 7 | the referrer's days |
| `REWARDS_REFERRAL_MONTHLY_CAP` | 4 | rewarded referrals per person per month |
| `REWARDS_BANK_CAP_DAYS` | 30 | promotional time waiting at once |
| `REWARDS_NEW_ACCOUNT_HOURS` | 72 | how new a referred account must be |
| `REWARDS_REFERRAL_COOKIE_DAYS` | 30 | how long the link is remembered |
| `REWARDS_ACTIVATION_SESSIONS` | 2 | meaningful sessions to become active |
| `REWARDS_ACTIVATION_DISTINCT_DAYS` | 1 | …on this many different days |
| `REWARDS_SESSION_USER_TURNS` | 2 | own messages in a meaningful session |
| `REWARDS_SESSION_WORDS` | 12 | own words in a meaningful session |
| `REWARDS_BLOCKED_EMAIL_DOMAINS` | — | extra disposable domains, comma-separated |

## Turning it on

1. Run the "Socria Rewards" section of `supabase/schema.sql`, then
   `supabase/rls.sql`. Both are safe to re-run.
2. Deploy. `vercel.json` adds the `/api/cron/rewards` daily cron, which uses
   the existing `CRON_SECRET`.
3. Set `REWARDS_ENABLED=1` on production when you decide to start.

No Stripe configuration is needed or changed.

Without the tables, Rewards answers "unavailable" and stays out of sight.
Entitlements are exactly as before.

## Tests

- `test/rewards.test.mjs` (133 checks) covers:
  - the engine: stacking, the cap, banking, pausing, expiry, the monthly limit,
    UTC months;
  - doing both: the challenge and a friend's activation stack to fourteen days
    in either order, and the cap still holds with more friends;
  - idempotency under randomised concurrency, and crash recovery;
  - paid-subscriber protection;
  - five-node qualification, including invalid, empty, duplicate and
    disconnected maps, attached and computed nodes, and starter text;
  - existing users with historical maps;
  - codes and cookies;
  - every attribution refusal, including self-referral;
  - A → B → C chains and direct-only rewards;
  - monthly caps through the program, and the status the panel shows.
- `test/rewards-popups.test.mjs` (60 checks) covers:
  - the popup rule: what may open by itself, the gaps, turns, "Not now" and
    acting, a clock set back, and a tolerant memory;
  - the marks in both rails, signed in only, and Logos saying the challenge
    once;
  - one popup per surface, only into a quiet room, once a visit;
  - what the popups say: the offers, the stacking sum and cap, members, the
    monthly limit, no urgency, and reduced motion.
- `test/rewards-wiring.test.mjs` (77 checks) covers:
  - the plan resolver's order;
  - checkout, the webhook, /one and the account sheet;
  - read-only plan checks;
  - the cookie and invitations, including Think Together;
  - deletion, export and constraints;
  - analytics shape and the surfaces' manners.
- The existing data-completeness and RLS-coverage suites now include the four
  tables.

**Not tested here:** a real Postgres (the store's queries are pinned by
source, and the in-memory store implements the same contract), real Clerk
accounts, and Stripe. Run the end-to-end path on a preview with the migration
applied before turning it on in production.
