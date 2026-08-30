# Keeping development private

Everything below is a dashboard change. The repo side is done — previews now
refuse crawlers, carry a visible badge, and say what is missing instead of
returning a 500 — but the parts that actually make a build *private* live in
Vercel, Clerk and Supabase, and someone with those logins has to do them.

Written August 2026.

---

## Why Clerk sign-in stopped working on previews

This is almost certainly what happened, and it is a one-line fix.

Clerk issues two instances per application: **development** (`pk_test_…` /
`sk_test_…`) and **production** (`pk_live_…` / `sk_live_…`).

- A **development** instance accepts **any origin**. That is what makes it
  work on `socria-git-somebranch-yourteam.vercel.app`, and on every new
  preview URL after it, without registering a single one.
- A **production** instance is bound to the domain you configured. On any
  other origin the sign-in handshake redirects to
  `<instance>.accounts.dev/v1/client/handshake` and never comes back. The
  deployment looks broken; it is not, it is refusing an origin it was told to
  refuse.

If preview sign-in used to work and now does not, the environment variables
were almost certainly moved to **All Environments** with production keys at
some point — probably when billing went live and the live keys went in.

**The fix.** In Vercel → *Settings → Environment Variables*, scope them:

| Variable | Production | Preview | Development |
|---|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_live_…` | `pk_test_…` | `pk_test_…` |
| `CLERK_SECRET_KEY` | `sk_live_…` | `sk_test_…` | `sk_test_…` |

Vercel lets one variable name hold a different value per environment. Use
that rather than a single "All Environments" entry — the whole problem is one
value being asked to serve two domains.

The badge in the bottom-left of every non-production build now checks this.
An amber dot means no keys; a rust dot means production keys on a preview,
with the explanation. A green dot means it is set up correctly.

---

## Making preview URLs actually private

A Vercel preview URL is public and guessable-adjacent. Two levers:

**1. Deployment Protection** — Vercel → *Settings → Deployment Protection*.
Set **Vercel Authentication** to "Standard Protection" (all preview
deployments). Anyone opening a preview then has to be logged into a Vercel
account on the team. This is the actual privacy mechanism; everything else is
defence in depth.

To share one build with someone outside the team, use a **Protection Bypass
for Automation** token or Vercel's "Share" link on that specific deployment,
rather than turning protection off.

**2. What the repo now does regardless** (already shipped):

- `app/robots.ts` serves `Disallow: /` on every non-production deployment,
  and is `force-dynamic` so it reflects the deployment serving it rather than
  the environment it was built in.
- `app/layout.tsx` adds `noindex, nofollow, nocache` to non-production. Robots
  asks politely; the meta tag tells.
- A badge names the environment, so a preview is never mistaken for the real
  site.

---

## Separating the data (the one that actually matters)

Protection stops strangers reading a preview. It does **not** stop a preview
writing to production. Right now every deployment points at the same Supabase
project and the same Stripe account, which means a branch can create, edit and
delete real conversations.

This is the open item from `docs/DATA-LIFECYCLE.md`, and it is the highest
value item on this page.

**Supabase.** Create a second project — "socria-dev" — and run
`supabase/schema.sql` and `supabase/rls.sql` against it. Then scope in Vercel:

| Variable | Production | Preview / Development |
|---|---|---|
| `SUPABASE_URL` | prod project | dev project |
| `SUPABASE_SERVICE_ROLE_KEY` | prod key | dev key |

**Stripe.** Use test-mode keys everywhere but production:
`STRIPE_SECRET_KEY=sk_test_…`, a test-mode `STRIPE_PRICE_SOCRIA_ONE`, and a
separate `STRIPE_WEBHOOK_SECRET` for the test endpoint. Otherwise a preview
can start a real subscription against a real card.

**OpenAI.** A separate API key for non-production makes spend legible per
environment and lets you revoke one without touching the other.

**Upstash.** Optional. Sharing the rate limiter across environments only
means previews eat production's budget; a second database is cheap if that
becomes annoying.

---

## The environment matrix, in full

| | Production | Preview | Local |
|---|---|---|---|
| Clerk | `pk_live_` / `sk_live_` | `pk_test_` / `sk_test_` | `pk_test_` / `sk_test_` |
| Supabase | prod project | dev project | dev project |
| Stripe | live keys | test keys | test keys |
| OpenAI | prod key | dev key | dev key |
| `NEXT_PUBLIC_SITE_URL` | `https://socria.app` | leave unset | `http://localhost:3000` |
| Indexed | yes | no | no |
| Badge | hidden | shown | shown |

`NEXT_PUBLIC_SITE_URL` deserves a note: it is used for OAuth redirect URIs and
Stripe return URLs. Setting it to the production domain on a preview sends
people back to production mid-flow. Leaving it unset makes the code fall back
to the request origin, which is what a preview wants.

---

## What is still not covered

Said plainly rather than left to be discovered:

- **OAuth connectors** (Google, Notion) register fixed redirect URIs, and a
  preview URL changes with every branch. Connecting a source will not work on
  previews unless you register that specific URL. The connectors ship dormant,
  so this bites nobody today.
- **Sanity** is one project with one dataset. A preview writes to the same
  blog content production reads. Create a `development` dataset and scope
  `NEXT_PUBLIC_SANITY_DATASET` if that ever matters.
- **A private repo** is a separate decision from any of the above, and one
  only you can make.
