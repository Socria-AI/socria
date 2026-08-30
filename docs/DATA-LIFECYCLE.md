# Data lifecycle

Internal reference. Not a published page — the public statements live at
`/privacy`, `/security` and `/subprocessors`, and **this document is the thing
they have to be true against**. If a row here changes, check whether a sentence
on one of those pages just became false.

Written August 2026. Every claim below is traceable to a file in this repo; the
citations are there so the next person can re-check rather than trust.

---

## 1. What actually exists

Four tables (`supabase/schema.sql`), one auth provider, one billing provider.
There is no other durable store. There is no data warehouse, no event pipeline,
no separate log database, no vector index.

| Store | Holds | Keyed by |
|---|---|---|
| `conversations` | title, messages, per-thread memory, Thinking Map, Draft Space, grounded contexts | `id` (PK), `user_id` |
| `user_profiles` | imported "about you" profile, cross-conversation Thinking Journey | `user_id` (PK) |
| `logos_connections` | encrypted OAuth token bundle per provider | `(user_id, provider)` (PK) |
| `socria_subscriptions` | Stripe customer/subscription ids, status, period end | `user_id` (PK) |
| Clerk | email, sign-in credentials, sessions | Clerk user id |
| Stripe | customer, subscription, payment method, invoices | Stripe customer id |
| Upstash Redis | one integer counter per rate-limit bucket | `rl:<bucket>:<user or ip>` |

`conversations.id` is the **sole** primary key — it does not include `user_id`.
That is a live sharp edge: any write path that conflicts on `id` alone can
cross accounts. See §7.

---

## 2. Collection

Nothing is collected passively beyond what serving a web request requires.

- **You type it.** Messages, drafts, custom instructions, an imported profile.
- **You attach it.** Files, pastes, and material pulled from Google or Notion
  after you connect those accounts yourself (`lib/logos-connect.ts`).
- **Socria derives it.** The Thinking Map, per-thread memory, insights,
  syntheses, and the Thinking Journey are all model output over your messages.
  They are the only category you did not write, and the only category the
  "clear memory" control removes on its own (§6).
- **The request carries it.** IP address and user agent reach Vercel in the
  ordinary course of serving the page. The IP is used inside the app for
  exactly one purpose: keying the rate limiter for signed-out callers
  (`lib/rate-limit.ts:84-86`).
- **Billing.** Card details go from the browser to Stripe and never touch our
  servers. We store the Stripe ids and the subscription status, nothing else
  (`lib/subscriptions.ts`).

No tracking pixels, no advertising SDKs, no session replay. Vercel Analytics is
page-view level and is not joined to any conversation.

---

## 3. Storage

- Postgres on Supabase (US), encrypted at rest by Supabase; TLS in transit.
- OAuth tokens are additionally encrypted **by us** before they are written,
  AES-256-GCM under `CONNECTION_SECRET` (`lib/logos-connections.ts:45-69`). The
  `logos_connections.secret` column never holds a plaintext token, so a
  database dump alone does not yield anyone's Google or Notion access.
- No other field is application-encrypted. Message content sits in `jsonb` in
  the clear, protected by Supabase's at-rest encryption and by access control,
  not by a key we hold. **State it that way publicly — do not imply
  end-to-end.**
- RLS is enabled with no policies and grants revoked from `anon` /
  `authenticated` (`supabase/rls.sql`). This is a second wall, not the first
  one: the API uses the service-role key, which bypasses RLS entirely. The real
  control is §7.

---

## 4. Use

Your content is used to run Socria for you, and for nothing else. Concretely:
to produce a reply, to extract the Thinking Map, to maintain memory and the
Thinking Journey, and to render what you already wrote.

It is **not** used to train any model — not ours (we have none) and not
OpenAI's (§5). It is not sold, and it is not shared with anyone outside the
sub-processor register.

---

## 5. AI processing

Every model call goes to the OpenAI API over TLS from the server. The browser
never holds `OPENAI_API_KEY`; it never leaves the Node runtime.

What is sent, per call:

| Route | Sends |
|---|---|
| `/api/chat`, `/api/logos/chat` | system prompt + recent turns of this conversation |
| `/api/logos/map` | last 16 messages, to extract the map (temp 0, JSON) |
| `/api/logos/explore`, `/draft`, `/read` | the selected node or passage, plus surrounding turns |
| `/api/extract-memory`, `/generate-insight`, `/generate-synthesis`, `/update-understanding` | conversation content, to derive the memory layer |

None of these routes reads another user's row — they are stateless with respect
to the database and operate only on what the caller's own request body carries.

**Retention at OpenAI, as published (verify before restating):** API data is
not used to train their models by default, and inputs and outputs are retained
up to 30 days for abuse monitoring before deletion, unless a longer period is
required by law. Socria calls the standard API — **we have not signed a DPA and
have not enabled Zero Data Retention** — so that 30-day window applies to us.
This is their published policy, not a contract we hold. Re-check it before any
enterprise conversation, and say so plainly rather than implying a guarantee.

Web search (`lib/logos-explore.ts`) sends **the search phrase only** to Serper
or Tavily. It never sends conversation content.

---

## 6. Retention and deletion

There is no automatic expiry on user content. A conversation lives until
someone deletes it. That is a deliberate product decision — this is a thinking
record — but it means deletion controls have to actually work.

| Control | Endpoint | Removes | Leaves |
|---|---|---|---|
| Delete one conversation | `DELETE /api/conversations/[id]` | that row entirely: messages, map, draft, contexts, memory | everything else |
| Clear memory | `DELETE /api/account/memory` | the derived keys from every conversation, plus `profile` and `understanding` | your messages, maps and drafts |
| Disconnect a source | `DELETE /api/logos/connections` | the encrypted token row | material already pulled into a conversation |
| Export | `GET /api/account/export` | — | returns every row keyed to you as JSON; connections are reported as *existing*, never with their tokens |
| Delete account | `DELETE /api/account/delete` | Stripe subscription cancelled **first**, then all four tables, then the Clerk user | nothing |

Deletes are immediate and hard — `.delete()`, not a soft flag. Nothing is kept
in a trash state.

The derived-memory key list is `DERIVED` in `app/api/account/memory/route.ts`.
**If a new derived field is added to memory, add it there too**, or "clear
memory" will quietly start leaving something behind.

Ordering in the account delete matters and is load-bearing: cancelling the
subscription before deleting rows means a failure to cancel aborts the whole
operation, rather than orphaning a live subscription with no account attached
to it (`app/api/account/delete/route.ts`).

### What we cannot delete on request

Be honest about these rather than implying total erasure:

- **Stripe** keeps invoice and transaction records for its own legal and tax
  obligations after a subscription is cancelled. That is Stripe's retention,
  not ours, and it is not ours to override.
- **OpenAI** may still hold the last 30 days of abuse-monitoring logs (§5).
- **Vercel** platform logs persist for whatever the current plan's window is.
  *Open item: confirm the exact window for the plan in use and record it here.*
- **Backups.** Supabase's own point-in-time backups retain a deleted row until
  they age out. *Open item: confirm the retention window on the current plan.*

### Logs and analytics

The application writes only operational lines — route name, table name, error
code, counts (`console.error`/`console.warn`, 46 sites). A scan of every one of
them found **no message content, email address, token, or prompt** in any log
line, and it should stay that way. Vercel Analytics is aggregate page views.
Rate-limit counters in Upstash carry a user id or IP and no content, and expire
within the hour on their own.

---

## 7. How accounts stay separate

The service-role key bypasses RLS, so the separation is enforced in the API
layer, on every single query, and that is where it has to be audited.

- Every read filters `.eq('user_id', userId)`.
- Every write filters `.eq('user_id', userId)`, or targets a table whose
  primary key already contains `user_id`.
- The AI routes hold no database state at all, so there is no id a caller could
  substitute to read someone else's thinking.
- The OAuth callback verifies an HMAC-signed state with a constant-time
  compare, **and** re-checks that the state's user id equals the live session's
  (`lib/logos-oauth.ts:94-102`, `app/api/logos/connect/[provider]/callback`).

**The one place this went wrong**, fixed August 2026: `PUT /api/conversations`
used `upsert`, which conflicts on `conversations.id` alone. A signed-in user
who knew another account's conversation id could overwrite its contents and
take ownership of the row by writing their own `user_id`. It is now a scoped
update-then-insert, and a primary-key collision on the insert returns 403. The
bulk `POST` path pre-reads the ids and drops any owned by another account.

That residual `POST` check is read-then-write, so it has a theoretical race if
two accounts import the same id in the same instant. Ids are client-generated
and random; the exposure is negligible, but the durable fix is a composite
primary key on `(id, user_id)`, and that is the right thing to do at the next
schema change.

**Rule for anyone adding a query: no `upsert` on `conversations`.** Scope the
update, or fix the primary key first.

---

## 8. Standing checks

Before shipping anything that touches storage:

1. New table? Add it to `OWNED_TABLES` in the account-delete route, to the
   export route, and to `supabase/rls.sql`.
2. New derived memory field? Add it to `DERIVED`.
3. New vendor receiving any user data? Add it to `/subprocessors` **before** it
   goes live, not after.
4. New query? `.eq('user_id', userId)`, no exceptions, and no `upsert` on
   `conversations`.
5. New log line? No content, no email, no token.

## 9. Open items

Things this document cannot close from inside the repo, and that need someone
with dashboard access:

- Confirm and record Supabase's backup retention window.
- Confirm and record Vercel's log retention window.
- MFA on the Supabase, Vercel, Clerk, Stripe, OpenAI and GitHub accounts.
- Rotate any key that predates this document or has ever been pasted anywhere.
- Separate dev / staging / production projects, so a mistake in development
  cannot reach real conversations. The steps are written up in
  `docs/PRIVATE-DEV.md`; the repo side (previews refuse crawlers, carry a
  badge, and warn on a Clerk key mismatch) is done, and what remains is
  scoping the Supabase, Stripe and OpenAI credentials per environment.
- Decide whether a DPA and Zero Data Retention with OpenAI are worth having
  before the first enterprise conversation, not during it.
