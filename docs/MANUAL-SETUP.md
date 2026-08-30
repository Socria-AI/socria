# What only you can do

Everything in this repository that could be automated has been. This file is
the remainder: changes that live in someone else's dashboard, behind your
login. Nothing here has been done for you.

They are ordered by consequence. **§1 affects people using Socria right now.**
The rest is hygiene that gets more expensive to skip the longer it waits.

Each step says what breaks if you skip it, so you can judge for yourself
rather than trusting the ordering.

---

## 1. Supabase — two objects the live site is already asking for

**Status: not done. Production is running without these right now.**

The release that just went out includes usage metering. It reads and writes a
`logos_usage` table and calls a `bump_logos_usage` function. Neither exists in
the database yet.

It is not throwing errors, and that is by design — `lib/usage.ts` **fails
open**. When the table is missing, every allowance check returns "allowed".
The reasoning: a free user getting more than they should is a pricing
question, but a paying user locked out by an unrun migration is a broken
product. So the failure is silent and generous.

The consequence: **free-tier limits are not being enforced.** Free accounts
currently get unlimited Logos chats, Explore, images and files.

Fix it:

1. Supabase dashboard → your **production** project → **SQL Editor**
2. Paste and run `supabase/schema.sql`
3. Paste and run `supabase/rls.sql`

Both are written to be safe to re-run (`create table if not exists`, `create
or replace function`, and RLS statements that are idempotent), so running the
whole file is fine even though most of it already exists.

Then confirm:

```sql
-- 0 rows, not "relation does not exist"
select count(*) from logos_usage;

-- returns 1, then 2 — the counter is incrementing atomically.
-- The last argument is epoch milliseconds (bigint), not a timestamp.
select bump_logos_usage('probe', '2026-08', 'chats', 1,
                        (extract(epoch from now()) * 1000)::bigint);
select bump_logos_usage('probe', '2026-08', 'chats', 1,
                        (extract(epoch from now()) * 1000)::bigint);

delete from logos_usage where user_id = 'probe';
```

If step 2 errors on a table that already exists with a different shape, stop
and send me the error rather than dropping anything.

**Do the same in your development Supabase project**, or local work will
behave differently from production for the same reason.

### While you are in there

`supabase/rls.sql` turns on Row Level Security with no policies, on all five
tables. That is intentional and worth understanding before you run it, because
it looks alarming.

The app talks to Postgres with the **service role key**, which bypasses RLS
entirely. So these policies are not what keeps one user out of another user's
rows — the `.eq('user_id', userId)` filter on every query is. RLS is the
second wall: if the anon key ever leaks or Supabase's auto-generated REST API
gets pointed at these tables, the answer is zero rows instead of the whole
table. Enabling it will not break the app, because the app was never relying
on it.

---

## 2. GitHub — the repository still points at the old branch

Two things, both in **Settings**, both about two minutes.

### 2a. Default branch → `main`

Settings → **General** → *Default branch* → the ⇄ icon → choose `main`.

It is currently `claude/beautiful-lovelace-xdkqcx`. Until you change it:
new pull requests default to the wrong base, `git clone` checks out the wrong
branch, and the branch shown to anyone visiting the repo is a working branch
rather than what is live.

All four branches (`main`, `staging`, `dev`, and the old claude branch) are at
the identical commit right now, so this switch changes nothing about what code
exists anywhere. It is purely a pointer.

Afterwards you can delete `claude/beautiful-lovelace-xdkqcx` and
`fix/conversations-cross-user-write` — both are fully merged into `main`,
verified with `git rev-list --count origin/main..<branch>` = 0. Nothing is
lost. Keep them if you would rather; they cost nothing.

### 2b. Branch protection on `main` and `staging`

Settings → **Rules** → **Rulesets** → *New ruleset* → *New branch ruleset*.

Do this **after** 2a, so `main` is the default when you name it.

- Name: `protect-main`, Enforcement status: **Active**
- Target branches → *Add target* → **Include default branch**
- Rules to tick:
  - **Restrict deletions**
  - **Block force pushes**
  - **Require a pull request before merging** → Required approvals: **0**
  - **Require status checks to pass** → *Add checks* → `typecheck · test · build`

**Set required approvals to 0, not 1.** You are the only maintainer. At 1 you
cannot approve your own pull request, which means you cannot merge anything,
which means you cannot ship a hotfix at 3am. Zero approvals still forces every
change through a pull request where CI runs — that is the part that catches
things. The approval count is about a second human, and there isn't one yet.

**Leave "Do not allow bypassing the above settings" unticked.** That preserves
the admin override described in `docs/DEPLOYMENT.md` §D: when production is
actively broken and CI is the thing in the way, you can merge anyway. It is an
escape hatch, not a workflow, and it is worth having.

The status check only appears in the picker once CI has run at least once on a
pull request. If the list is empty, open any throwaway PR, let it run, then
come back.

Repeat the whole ruleset for `staging` (name it `protect-staging`, target
`staging` by name instead of "default branch"). Do **not** protect `dev` —
day-to-day integration should stay friction-free.

### 2c. Making the repository private — deliberately not yet

You said not yet, so this is a note, not a step. Two things to know for when
you do: branch protection rulesets stay free on private repos for personal
accounts, and Vercel keeps deploying a private repo without any reconnection.
The one thing that changes is that anonymous preview links stop working for
people who are not collaborators.

---

## 3. Vercel — production branch, environments, and preview privacy

The Vercel MCP connection in this session is not authenticated to your
account, so I could not read any of this, let alone change it. Everything
below is unverified and needs your eyes.

### 3a. Confirm the production branch

Settings → **Git** → *Production Branch*.

It must say `main`. Vercel stores this **independently of the GitHub default
branch** — changing 2a does not change this, and this is the one that decides
what deploys to socria.app. If it currently says
`claude/beautiful-lovelace-xdkqcx`, change it to `main`.

Since every branch is at the same commit today, this is safe to change now and
will get dangerous to leave wrong the moment the branches diverge.

### 3b. Split the environment variables

Settings → **Environment Variables**. Each variable has checkboxes for
Production / Preview / Development. The likely current state is that
everything is ticked for all three, which means preview deployments are
running against live Stripe and the production database.

| Variable | Production | Preview + Development |
|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_live_…` | `pk_test_…` |
| `CLERK_SECRET_KEY` | `sk_live_…` | `sk_test_…` |
| `SUPABASE_URL` | prod project | dev project |
| `SUPABASE_SERVICE_ROLE_KEY` | prod key | dev key |
| `STRIPE_SECRET_KEY` | `sk_live_…` | `sk_test_…` |
| `STRIPE_PRICE_SOCRIA_ONE` | live price id | test price id |
| `STRIPE_WEBHOOK_SECRET` | live endpoint secret | test endpoint secret |
| `OPENAI_API_KEY` | prod key | separate key, so spend is legible |
| `NEXT_PUBLIC_SITE_URL` | `https://socria.app` | **unset — leave it blank** |
| `CONNECTION_SECRET` | prod value | a *different* value |

Two of these are worth spelling out.

**`NEXT_PUBLIC_SITE_URL` must be unset on Preview.** It builds OAuth redirect
URIs and Stripe return URLs. Set to the production domain on a preview, it
sends people from your preview back to the live site mid-sign-in, which looks
like a bug in a place you will not think to look. Unset, the code falls back
to the request origin, which is what a preview wants.

**`CONNECTION_SECRET` must differ between environments.** It encrypts stored
OAuth tokens. Sharing it means a preview deployment can decrypt production
users' connected accounts.

After saving, redeploy — environment variables are read at build time, so
existing deployments keep their old values.

The build now checks this for you: `npm run vercel-build` runs the environment
gate before `next build`, so every deployment log opens with either
`environment ok for "preview"` or a list of exactly what is wrong. Missing
variables warn and let the deploy through; a secret exposed to the browser
through a `NEXT_PUBLIC_` prefix fails the build outright. Vercel picks that
script up automatically because it is named `vercel-build` — there is nothing
to configure.

### 3c. Make preview deployments private

Settings → **Deployment Protection** → *Vercel Authentication* → **Standard
Protection** (covers all preview deployments, leaves production public).

This is the thing you actually asked for when you said you wanted development
to stop being public. With it on, a preview URL returns a Vercel login page to
anyone who is not you or a team member. Production is unaffected.

Free-plan note: Vercel Authentication is available on Hobby, but only for
accounts where you are the only member. If the option is greyed out, the
fallback is *Password Protection* — Pro only — or accepting that preview URLs
are unguessable-but-public, which is what you have today.

Two smaller things already handled in code, so you do not need to do anything
about them — listed only so you know they are covered: `app/robots.ts` serves
`Disallow: /` on any non-production deployment (evaluated per request, not
baked in at build), and non-production builds show an environment badge that
names the deployment and flags a Clerk key/domain mismatch.

---

## 4. Clerk — the reason preview sign-in broke

There is nothing to change here if you get 3b right; this section is the
explanation, because this is the failure you hit and it is genuinely confusing.

A Clerk **production instance** is bound to its domain. Hand its `pk_live_`
key to a preview deployment and the sign-in handshake redirects to
`socria.app`, completes there, and never comes back. The preview looks broken
when it is doing exactly what it was told. A **development instance**
(`pk_test_`) accepts any origin, which is why this used to work — the setup
changed, not Clerk.

So: development instance keys on Preview and Development, production instance
keys on Production only. That is 3b, and it is the whole fix.

Worth doing while you are in the Clerk dashboard:

- **Development instance** → *Paths*: confirm the sign-in and after-sign-in
  URLs are relative paths (`/sign-in`, `/`), not absolute URLs to socria.app.
  An absolute URL reintroduces the same bug from the other direction.
- **Production instance** → *Domains*: confirm `socria.app` is verified and
  the DNS records Clerk asked for are still in place. An expired CNAME here
  takes production sign-in down with no warning.

---

## 5. Stripe — two dashboards, and the webhook that is easy to forget

Stripe's test and live modes are separate worlds with separate everything.
Whatever exists in one does not exist in the other.

**Live mode** (production):

- Confirm the Socria One product and price exist, and that the price id
  matches `STRIPE_PRICE_SOCRIA_ONE` in Vercel's Production scope
- Developers → **Webhooks**: an endpoint at
  `https://socria.app/api/stripe/webhook`
- Its signing secret must match `STRIPE_WEBHOOK_SECRET` in Production

**Test mode** (preview and local): the same three things, in test mode, with
test values. The product and price have to be created separately — a live
price id is not valid in test mode, so checkout in preview fails with a
confusing "no such price" until you do.

The webhook is the part people skip, because checkout appears to work without
it. It does — the payment succeeds and the customer is charged. What does not
happen is Socria hearing about it, so the subscription is never recorded and
the user pays and stays on the free tier. Test it with a real test-mode
checkout and confirm a row lands in `socria_subscriptions`.

For local development, `stripe listen --forward-to
localhost:3000/api/stripe/webhook` prints a signing secret for your `.env`.

---

## 6. OAuth providers — Google and Notion

These are for the Connections feature (`lib/logos-oauth.ts`,
`lib/logos-connect.ts`), driven by `GOOGLE_OAUTH_CLIENT_ID` and
`NOTION_OAUTH_CLIENT_ID`. Both are optional — the feature hides itself when
the variables are absent, so you can skip this section entirely if Connections
is not something you are shipping yet.

If you are:

The redirect URI is built by `redirectUri()` in `lib/logos-oauth.ts` as
`{origin}/api/logos/connect/{provider}/callback`, so the exact strings to
register are:

**Google Cloud Console** → APIs & Services → Credentials → your OAuth client →
*Authorised redirect URIs*:

```
https://socria.app/api/logos/connect/google/callback
http://localhost:3000/api/logos/connect/google/callback
```

**Notion** → your integration → *Distribution* → *Redirect URIs*:

```
https://socria.app/api/logos/connect/notion/callback
http://localhost:3000/api/logos/connect/notion/callback
```

Both providers require these to match **exactly** — scheme, host, path, no
trailing slash, no wildcards.

You also need `CONNECTION_SECRET` set (at least 16 characters), or the flow
throws before it reaches the provider — it is the key for both the encrypted
token store and the signed CSRF state. It is marked optional in the
environment spec because Connections as a whole is optional, not because the
feature works without it.

One consequence worth knowing: preview deployments cannot complete OAuth.
`redirectUri()` falls back to the request origin when `NEXT_PUBLIC_SITE_URL`
is unset — which §3b tells you to leave unset on Preview, correctly — and a
preview's origin changes with every deployment, so it can never match a
registered URI. If you need to test OAuth on a preview, register that one
stable branch alias URL and expect the per-commit URLs to fail. Local
development works because `localhost:3000` is stable and registered above.

---

## Afterwards

Once §1 and §2 are done, this is the state you should be able to confirm:

- `select count(*) from logos_usage` returns a number, not an error
- A free account hits the boundary on its third Logos chat in a month
- The repository's default branch reads `main`
- A direct `git push` to `main` is rejected
- A pull request into `main` shows a required `typecheck · test · build` check
- socria.app still works

That last one is not a joke. Check it after each section, not at the end —
finding out which of six dashboard changes broke sign-in is much harder than
noticing which one just did.
