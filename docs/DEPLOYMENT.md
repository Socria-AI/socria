# How Socria ships

Read this before your first merge. It is short on purpose.

The whole design exists to answer one question: **can we fix a production bug
today while a major version is half-finished?** Yes — because unreleased work
never sits between a fix and production. That is the only rule that really
matters here; everything below serves it.

---

## The branches

```
main                  what is live. Only released code.
staging               a release being assembled. Optional for small changes.
feature/<name>        unreleased work. Can live for weeks.
fix/<name>            a small production fix. Branched from main.
```

`main` is the production branch. Nothing reaches it except through a pull
request that CI has passed.

A long-lived `feature/` branch is **never** in the path from a fix to
production. That is what makes a hotfix possible mid-project: the fix branches
from `main`, and merges back to `main`, and the feature branch is not involved
at any point.

---

## A. A normal feature

```
git switch main && git pull
git switch -c feature/logos-improvement
# … work …
git push -u origin feature/logos-improvement
```

Pushing opens a private preview deployment. Open a pull request into `main`
(or into `staging` if it is part of a coordinated release). CI runs
typecheck, tests and a production build. Review, merge, done — merging to
`main` deploys production.

## B. Major long-running development

Same start, but the branch lives for weeks:

```
git switch -c feature/v2
```

It gets its own preview URL, which updates on every push, and it stays out of
production until you deliberately merge it. Meanwhile `main` keeps receiving
fixes (C below). Pull those into your branch regularly — weekly is plenty:

```
git switch feature/v2
git merge origin/main          # NOT rebase — see below
```

**Merge, not rebase, for shared long-lived branches.** Rebase rewrites
history, so anyone else who has pulled the branch gets a conflict that looks
like the branch forked from itself. Rebase is fine on a `fix/` branch you
alone have touched and have not yet pushed; it is the wrong tool on a branch
two people are working in. When in doubt: merge.

## C. A production fix while the major version is unfinished

This is the case the whole model is built around.

```
git switch main && git pull
git switch -c fix/logos-node-bug
# … fix, and add a test that fails without it …
npm run verify                 # typecheck + tests + build, locally
git push -u origin fix/logos-node-bug
```

Open a PR into `main`, check the preview, let CI pass, merge. Production
deploys. **`feature/v2` is untouched and unreleased** — it was never in the
path.

Then give the fix to the long-lived branch so it is not lost at merge time:

```
git switch feature/v2
git merge origin/main
git push
```

## D. Emergency hotfix

Identical to C, minus the waiting. The protections are built so this stays
fast:

```
git switch main && git pull
git switch -c fix/urgent-thing
# … smallest possible change …
git push -u origin fix/urgent-thing
```

Open the PR, let CI run (about two minutes), merge. If you are the only
person awake, approve it yourself — the branch rule permits that. What you
must not do is push straight to `main`; the point of the gate is that CI
still runs, not that a second human is always available.

If production is actively broken and CI is the thing standing in the way, an
admin can merge without checks. Do it, then say so in the PR. It is an escape
hatch, not a workflow.

---

## Running the checks yourself

```
npm run typecheck     the whole project
npm test              all suites (or: npm test -- viz)
npm run build         a real production build
npm run verify        all three, in the order CI runs them
npm run check:env     is this environment complete and safe?
```

`npm test` builds the pure modules with esbuild and runs each suite in its own
process: the evaluator, the visualisation builders and sanitizers, the
entitlement table, the local detectors — about 400 assertions plus a
4,000-input fuzz. No network, no database, a few seconds.

`npm run check:env` is separate because CI has no real environment to check.
It catches three things: a required variable missing, one that is malformed
(a trailing slash on `NEXT_PUBLIC_SITE_URL` breaks OAuth redirects), and —
the one that matters most — **a secret exposed to the browser through a
`NEXT_PUBLIC_` prefix**. That last one is a one-way door: anything inlined
into a client bundle is public in every build already deployed, so the only
fix is to rotate the key.

---

## Environments

| | Production | Preview / staging | Local |
|---|---|---|---|
| Branch | `main` | any other | — |
| Clerk | `pk_live_` / `sk_live_` | `pk_test_` / `sk_test_` | `pk_test_` / `sk_test_` |
| Supabase | prod project | dev project | dev project |
| Stripe | live keys | test keys | test keys |
| OpenAI | prod key | dev key | dev key |
| `NEXT_PUBLIC_SITE_URL` | `https://socria.app` | **unset** | `http://localhost:3000` |
| Indexed by search | yes | no | no |
| Environment badge | hidden | shown | shown |

Two of these are worth spelling out.

**Clerk.** A production key is bound to the production domain and will refuse
a preview URL — the sign-in handshake redirects away and never returns, and
the deployment looks broken when it is only doing what it was told. A
development instance accepts any origin. Non-production builds carry a badge
in the corner that checks this and names the problem.

**`NEXT_PUBLIC_SITE_URL`.** It is used for OAuth redirect URIs and Stripe
return URLs. Setting it to the production domain on a preview sends people
back to production mid-flow. Leave it unset there; the code falls back to the
request origin, which is what a preview wants.

Setup steps for all of this are in `docs/PRIVATE-DEV.md`.

---

## What CI does not do, and why

- **No lint.** There is no ESLint config, and adding one now would flag
  hundreds of things in untouched code. A red tick people learn to ignore is
  worse than no tick. Worth doing as its own piece of work.
- **No end-to-end tests.** The browser checks in this project have been run by
  hand against a real build. Automating them is worthwhile and is not free;
  it is not a prerequisite for the rest of this.
- **No environment check.** CI has no real environment. That gate belongs in
  the Vercel build.

Neither absence is pretended over. If a check is not here, it is not being
done.
