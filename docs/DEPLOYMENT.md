# How Socria ships

Read this before your first merge. It is short on purpose.

> Some of what this describes is not switched on yet — branch protection, the
> production-branch setting, and a database migration the live site is already
> asking for all live in dashboards this repository cannot reach.
> **`docs/MANUAL-SETUP.md` is the list of what only you can do**, in order of
> consequence. Start there if nothing below seems to be enforced.

The whole design exists to answer one question: **can we fix a production bug
today while a major version is half-finished?** Yes — because unreleased work
never sits between a fix and production. That is the only rule that really
matters here; everything below serves it.

---

## The branches

```
main                  what is live. Only released code.
staging               a release being assembled and tested.
dev                   where day-to-day work lands and integrates.
feature/<name>        a piece of work, branched from dev. Can live for weeks.
fix/<name>            a production fix, branched from MAIN. Not from dev.
```

Work flows one way:

```
feature/*  →  dev  →  staging  →  main  →  production
```

with exactly one exception, and it is the important one:

```
fix/*  →  main                     (then main → staging → dev)
```

`main` is the production branch. Nothing reaches it except through a pull
request that CI has passed.

**A fix branches from `main`, never from `dev`.** That single rule is what
makes it possible to ship a production fix while a major version is
half-finished: unreleased work is never in the path between the fix and
production, so it cannot ride along. If you branch a fix from `dev` you drag
everything unreleased with it — which is the exact failure this model exists
to prevent.

After a fix ships, carry it forward so it is not lost at the next release:

```
git switch staging && git merge origin/main && git push
git switch dev     && git merge origin/main && git push
```

---

## A. A normal feature

```
git switch dev && git pull
git switch -c feature/logos-improvement
# … work …
git push -u origin feature/logos-improvement
```

Pushing opens a private preview deployment. Open a pull request into `dev`.
CI runs typecheck, tests and a production build. Review and merge.

Nothing has shipped yet — `dev` is not deployed to anyone. When a set of work
is ready to go out, open `dev → staging`, test it on the staging URL, then
open `staging → main`. Merging to `main` deploys production.

## B. Major long-running development

Same start, but the branch lives for weeks:

```
git switch dev && git pull
git switch -c feature/v2
```

It gets its own preview URL, which updates on every push, and it stays out of
production until it goes `dev → staging → main`. Meanwhile `main` keeps
receiving fixes (C below). Pull those forward regularly — weekly is plenty:

```
git switch feature/v2
git merge origin/dev           # NOT rebase — see below
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
deploys. **`dev` and `feature/v2` are untouched and unreleased** — neither was
ever in the path.

Then carry the fix forward, or the next release will revert it:

```
git switch staging && git merge origin/main && git push
git switch dev     && git merge origin/main && git push
```

This is not optional. A fix that lives only on `main` is a fix that
disappears the next time `staging` merges in.

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

Vercel runs it too. `npm run vercel-build` is `check:env --soft` followed by
the build, and Vercel prefers that script over `build` when it exists, so
every deployment checks the environment it is actually being given — which is
the only place the real variables exist.

`--soft` is the difference between the two. Locally and in `npm run verify`
the check is strict: any problem fails. On Vercel only a **leaked secret**
fails the build; a missing or malformed variable is printed loudly and the
deploy continues. That asymmetry is deliberate. Nothing in this codebase
throws at runtime over a missing variable — the feature degrades and the app
stays up — so a validator that could take production offline would be adding
a risk larger than the one it removes. A leaked secret has no such symmetry:
it cannot be undone by a redeploy, only by rotating the key, so it is stopped
everywhere.

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

Setup steps for all of this are in `docs/PRIVATE-DEV.md`, and the
dashboard-by-dashboard checklist — including which variables go in which
Vercel scope — is in `docs/MANUAL-SETUP.md`.

---

## What CI does not do, and why

- **No lint.** There is no ESLint config, and adding one now would flag
  hundreds of things in untouched code. A red tick people learn to ignore is
  worse than no tick. Worth doing as its own piece of work.
- **No end-to-end tests.** The browser checks in this project have been run by
  hand against a real build. Automating them is worthwhile and is not free;
  it is not a prerequisite for the rest of this.
- **No environment check.** CI has no real environment, so there is nothing
  to validate. That gate lives in the Vercel build instead, via
  `vercel-build`, where the actual variables are.

Neither absence is pretended over. If a check is not here, it is not being
done.
