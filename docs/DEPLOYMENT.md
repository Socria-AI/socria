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

## Lifecycle email

Socria sends a handful of notes on its own — a welcome when someone joins
One, the boundary's own words a day after a free line of thinking was
refused, and "your maps are where you left them" three and seven days after
a first session. The rules are in `lib/lifecycle.ts`; the ledger that makes
each one once-ever is `lifecycle_emails` in `supabase/schema.sql`, which
also defines the `lifecycle_candidates` function the daily run reads. Both
are in the same file as every other migration; run it as usual.

`vercel.json` schedules `GET /api/cron/lifecycle` once a day (15:00 UTC).
Vercel presents `CRON_SECRET` as a bearer token on that request; the route
answers 503 without the variable and 401 without the token, and never sends
from a request it cannot verify.

**Off by default, everywhere.** Nothing is sent unless `LIFECYCLE_EMAILS`
reads exactly `on`, and then only when `EMAIL_SECRET` (signs the unsubscribe
links) and `RESEND_API_KEY` are also set. Set all three on **Production
only**. A preview with production's keys copied into it will run the cron
and stay silent, which is the point: a branch must never mail real people.

| | Production | Preview / staging | Local |
|---|---|---|---|
| `LIFECYCLE_EMAILS` | `on` | **unset** | **unset** |
| `EMAIL_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM` | set | unset | unset |
| `CRON_SECRET` | set | set (the route answers 503 without it) | unset |

The run reports counts by kind and outcome, nothing else — no ids, no
addresses — and the analytics event it emits (`lifecycle_email_sent`) is
the kind and the word `cron`. Every note carries a signed unsubscribe link
and the `List-Unsubscribe` headers; the switch a person sees under Data &
Privacy writes the same row the link does.

**Rehearse before the switch goes on.** Vercel cron runs on production
only, so the candidate query's first real execution would otherwise be the
one that emails people. Two aids, both in the route:

```
curl -H "Authorization: Bearer $CRON_SECRET" "https://<deployment>/api/cron/lifecycle?dry=1"
```

runs the whole selection and every decision and sends nothing — the answer
is counts per kind (`would-send`, `too-early`, `not-quiet`, …). It works
with `LIFECYCLE_EMAILS` unset. Then `LIFECYCLE_TEST_USER_IDS=<your id>`
restricts real sends to the listed accounts, so the first live run on a
preview reaches one person on the team. Only when both have been seen to
behave does the switch go on in production, with the allow-list removed.

Whether the day-3 and day-7 notes should be opt-in rather than opt-out for
people in the EU and UK has not been decided; that is why the switch ships
off. Turn it on when it has.

## Newsletter

The sign-up form carries one checkbox: "Send me the Socria newsletter".
It starts **ticked** in the US and most other countries, and **unticked**
in the EU and the rest of the EEA, the UK (with Jersey, Guernsey, the Isle
of Man and Gibraltar), Switzerland and Canada — and wherever the visitor's
country is unknown, which includes a local run. The country is Vercel's
`x-vercel-ip-country` header, read by the sign-up page; the list is
`OPT_IN_COUNTRIES` in `lib/newsletter-consent.ts`. Ticked when the account
is made, the new account is subscribed the moment it is signed in
(`PUT /api/email/preferences {newsletter: true}`); unticked, nothing is
written. The subscription is a row in the same ledger as the
notes (`lifecycle_emails`, kind `newsletter`), so there is no migration to
run. The switch under Data & Privacy writes and removes the same row, and
so does every unsubscribe link: an issue's own link (`l=newsletter`) stops
the newsletter alone; any other Socria unsubscribe link stops everything.

Issues are code. Each one is an entry in `lib/newsletter-issues.ts`,
reviewed and deployed before it can go; the send route sends only an issue
it finds there, by id, and nothing in a request becomes email copy. Every
issue carries the reason it arrived, a one-click unsubscribe and the
`List-Unsubscribe` headers, and is never sent to a university address added
for student access.

**Off by default, and separate from the notes.** A real send needs all of:

| Variable | What it is |
|---|---|
| `NEWSLETTER_EMAILS` | `on` — its own kill switch; unset is off. Turning on `LIFECYCLE_EMAILS` does not send a newsletter, and this does not start the notes. |
| `NEWSLETTER_POSTAL_ADDRESS` | The sender's postal address, printed in every issue. US law (CAN-SPAM) requires one in a commercial email; an issue does not render without it. |
| `EMAIL_SECRET`, `RESEND_API_KEY` | As for the notes. |
| `CRON_SECRET` | The bearer token for the send route and the cron. |
| `NEWSLETTER_EVERY_DAYS` | Optional. Days between issues, 1–30; unset is 2. |

Set them on **Production only**, as with the notes.

**The schedule: one approved issue every other day.** A daily cron
(`/api/cron/newsletter`, 16:00 UTC, in `vercel.json`) sends the approved
issues — those in `lib/newsletter-issues.ts` without `draft` — one every
`NEWSLETTER_EVERY_DAYS` days (unset is 2), in the order they are listed.
Each run either keeps delivering the issue that is going out (to whoever has
not had it, including anyone who subscribed since), starts the next approved
issue once the current one's days are up, or does nothing when no approved
issue is waiting. **It never writes an issue**: with the queue empty, no
email goes. Every-other-day means about fifteen issues a month to keep it
going.

A run sends as many as fit in its 45-second budget (about 80 at the
provider's pace). With more subscribers than that, the rest get the issue on
the next day's run, inside the same two days; past ~160 subscribers an issue
would not reach everyone before the next starts. Run the cron more often then
(hourly needs a paid Vercel plan) — the ledger makes repeated runs safe.

Rehearse the schedule without sending anything (works with the switch off):

```
curl "https://<deployment>/api/cron/newsletter?dry=1" -H "Authorization: Bearer $CRON_SECRET"
```

**Approving an issue:**

1. Write the issue in `lib/newsletter-issues.ts` with `draft: true`, and deploy.
2. Rehearse it. Nothing is sent or claimed; the answer has the counts
   (`would-send`, `no-address`), what a real send still needs (`missing`)
   and the rendered issue (`preview`):

   ```
   curl -X POST "https://<deployment>/api/email/newsletter" \
     -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" \
     -d '{"issue":"<id>"}'
   ```

3. Take `draft` off and deploy. It goes out on its turn.

**Sending one by hand**, now instead of on its turn (the issue must be
approved): `-d '{"issue":"<id>","send":true}'`, or to yourself first with
`"only":["<your user id>"]`. Each call sends a batch (40 by default, at most
50, paced under Resend's default two requests a second); call again until the
answer says `"done": true`. A hand send — even to yourself — starts that
issue's turn, and the schedule carries on from it. Every person's copy is
claimed in the ledger before it goes (`newsletter:<id>`), so a repeated or
overlapping call, or a hand send and the schedule together, never send anyone
a second copy.

An issue's id is permanent once it has gone to anyone — it is that
once-ever key, so a changed id is a new issue and would go to everyone
again.

**Why the box depends on the country.** CAN-SPAM allows a ticked box, so
long as every issue carries the unsubscribe and the postal address, which
the code enforces. The GDPR does not accept a pre-ticked box as consent
(Recital 32; the UK's PECR uses the same standard), Switzerland's UWG asks
for consent to marketing email, and Canada's CASL wants an opt-in the person
makes themselves — so in those places the box starts unticked. Other
countries also expect an opt-in for marketing email (Australia, Brazil,
Japan and South Korea among them); adding a country is adding its code to
`OPT_IN_COUNTRIES`. The lookup is by IP address, so a visitor on a VPN is
placed where the VPN is.

## Model spend

Every model call logs one line with what it read, how much of that the
provider served from its prompt cache, and what it wrote
(`lib/openai-usage.ts`):

```
[tokens] {"route":"logos/map","model":"…","in":19830,"cached":19456,"out":612}
```

Export a deployment's runtime logs and total them by route:

```
node scripts/token-report.mjs < logs.txt
```

The cache share is the column to watch. OpenAI caches the longest prefix of a
request it has recently seen, byte for byte, and on GPT-5.6 only a prefix that
ends where a message ends — so the long prompts are laid out for it. The map
extractor's ~19k tokens of instructions are a message of their own, with the
map as it stands and the conversation in the message after them
(`lib/logos.ts` `mapInstructions`, `mapAsItStands`). The Logos reply is ordered
stable prompt, then the history, then this turn's context, then the person's
newest message (`app/api/logos/chat`). A route whose cache share stays near
zero has something changing in its first message. The reply's history stops
caching once a conversation passes 24 messages, because the window then
slides by one each turn. Documents travel in the newest message and are read
afresh each turn.

GPT-5.6 also bills writing a prefix into the cache above the normal input
price, and reading it back well below it, so a prefix read again pays for
itself and one never reused costs a little more. The log records reads
(`cached`); writes (`cache_write_tokens` in the usage) are not in it yet.

The map pass runs on GPT 5.6 Terra (`LOGOS_MAP_MODEL`), every other Logos call
on Sol. `OPENAI_MODEL_LOGOS_MAP` moves the map with no redeploy;
`OPENAI_MODEL_LOGOS` no longer does. A refused id steps down to Sol, then to
`gpt-4o`, with a `logos map: … was refused` warning in the log — and the
`model` in the `[tokens]` lines says which one answered.

A turn that says only "ok" or "thanks" does not rebuild the map
(`lib/map-skip.ts`). The next turn that says something sends the whole
conversation as before.

`SOCRIA_TOKEN_LOG=off` silences the lines. Transcription is billed by the
minute and is not in them; neither is the upstream health check.

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
