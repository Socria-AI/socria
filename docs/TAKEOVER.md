# The relaunch: "WE KILLED THE CHATBOT."

While the relaunch runs, the public site is one page: black, a chat window
that comes apart into a network of nodes, the line **WE KILLED THE
CHATBOT.**, and beneath it a field for an access code and an **Enter** button.
The right code opens Logos 5. Nothing else on the page is a message.

It is a takeover, not a rebuild: it sits in front of the site, touches no data,
account, billing or backend code, and is switched off with one variable.

## What a visitor meets

| Address | Without the code | With it |
|---|---|---|
| `/` | the campaign page | straight to Logos 5 (`/chat`) |
| Logos 5 and what opens into it: `/chat`, `/logos`, `/logos2`, `/logos2-test`, `/memory`, `/model`, `/mind-ar`, `/onboarding`, `/s/…` (share links), `/logos-5-internal` | the campaign page, **at that address** — so entering the code opens the link that was followed | the page |
| Every other page — the landing's sections, `/one`, `/charter`, `/docs/…`, `/blog/…`, `/students`, `/support`, `/explore`, `/surfaces`, anything unknown | a temporary (307) redirect to `/` | the same, and from `/` on into Logos 5 |
| What has to keep working — `/sign-in`, `/sign-up`, `/sso-callback`, `/account/…` (billing, data export, deletion, email switches), `/privacy`, `/terms`, `/security`, `/subprocessors`, `/events/…` (RSVPs, emailed tickets, the door), `/r/…` (referral links), `/og/…` (link previews), `/dev/…`, `/studio`, the platform's own paths | unchanged | unchanged |

The API is untouched except the routes that do Logos 5's thinking — a turn
(`/api/logos/chat`), the map, organize, practice, read, write, synthesize,
explore, experience, the guest pass, sources, live rooms, `/api/chat`,
`/api/mr`, `/api/transcribe` and the background passes (`extract-memory`,
`update-understanding`, `generate-insight`, `generate-synthesis`). Without the
code they answer `403 { locked: true }`, so the gate cannot be stepped round
by calling the engine directly. Data, the account, billing and Stripe's
webhook, email, cron, events and every other route never ask for the code.

The list is in one place, `lib/takeover.ts` (`APP`, `OPEN`, `THINKING_API`),
and `test/takeover.test.mjs` walks every API route on disk to prove that only
the thinking routes are gated.

## The code

- **Checked on the server only.** The page posts what was typed to
  `POST /api/access/enter`, which compares it and answers with a cookie. The
  code is never in a browser bundle.
- **Not in this repository, which is public.** `lib/takeover.ts` holds its
  fingerprint — PBKDF2-SHA256, 300,000 rounds, salted — not the code. Whoever
  types the code matches it; recovering the code from it is a long, costly
  search. The test suite fingerprints every word in the campaign's files to
  prove none of them is the code.
- **Case and spaces never matter.** The field shows capitals as you type, and
  the server compares the code upper-cased with spaces removed, so a phone
  that capitalises only the first letter still gets in.
- **Rate limited**, on its own budget (`enter` in `lib/rate-limit.ts`: 60 a
  minute, 2,000 a day per address). It is generous because the code is
  handed to rooms of people, and a room on one campus Wi-Fi is one address.
  Each try costs a PBKDF2, so a script gets nowhere.
- **Changing it**: set `SOCRIA_TAKEOVER_CODE` on Vercel and redeploy. The new
  code replaces the built-in one, and every entry made with the old code
  stops working at once (the cookie's signing key is derived from the live
  code).

## The entry

A right code sets `socria_entry`: `httpOnly`, `SameSite=Lax`, `Secure` in
production, 90 days. It holds an expiry and an HMAC of it, signed with a
server secret mixed with the live code's fingerprint — `SOCRIA_TAKEOVER_SECRET`
if set, otherwise the deployment's `CLERK_SECRET_KEY` (or the Supabase service
key). It cannot be written by hand, extended, or carried to another deployment.
With no secret at all nobody can enter: the gate stays shut rather than open.

The middleware (`middleware.ts`, on the edge) checks the cookie only for the
addresses whose answer depends on it, with Web Crypto; the same module signs
it in Node. `DELETE /api/access/enter` clears it.

## The page

`components/campaign/Campaign.tsx`, with its stylesheet beside it.

- **The opening** (`lib/campaign/scene.ts`, drawn on a canvas by
  `components/campaign/draw.ts`), about 6.8 seconds:
  - 0.2–2.0 s: a chat window assembles: frame, header, three messages, the
    input, then "typing…".
  - About 2.4 s: the whole interface turns to grain.
  - From 2.6 s: a wave goes out from the typing dots. Each grain it passes
    breaks away and swoops into one of the nodes spread across the screen.
  - 4.5–6.3 s: the nodes light and the links between them draw in.
  - 5.2 s: the line. 5.8 s: the field. 6.8 s: settled.
  - Afterwards the network drifts slowly, leans away from the pointer, and
    small signals run along its links.

  Every position is a function of time alone, so a resize carries on at the
  same moment. The suite checks that every grain starts on the chat and ends
  in its node.
- **Pacing.** The clock starts when the page arrived, so a slow phone joins the
  story late rather than holding the words back. A tab that has seen it begins
  at the network forming. A key or a tap skips to the end, and a letter typed
  early still lands in the field. With reduced motion there is no opening,
  only the finished network, still.
- **Without JavaScript** the line and the field are simply there, and the field
  is a plain form: a right code redirects into Logos 5.
- **A miss** is said quietly under the field ("That code isn’t right."), with a
  small shake; the typed code stays selected to correct.
- **A phone's keyboard** never covers the field: the line and the field lift
  above it.
- **Metadata**: the title and description are the line itself, there is no
  structured data, the link-preview card is `/og/campaign` (black, the
  network, the line), and the browser's chrome is black.

## The waitlist

The page's ask. Under the line, an email field with **Join the waitlist**; a
joined address reads "You’re on the list." The access code is the small way
in: **Have an access code?** turns the field into a smaller code field with
**Enter**, and **Join the waitlist instead** turns it back. Without
JavaScript the form posts the email straight onto the list.

- **Kept** in a private Supabase Storage bucket, `socria-waitlist`, made on
  first use (no table, no migration): one empty object per address under
  `entries/`, named by the address (base64url). So the same address twice is
  kept once, and listing the bucket is reading the list. `lib/waitlist.ts`.
- **Taken** by `POST /api/waitlist { email }`: trimmed, lower-cased, checked,
  and rate limited on the code field's budget. Open whatever the campaign.
- **Read** as one text file, `waitlist.txt` (an address and when it joined,
  one per line, oldest first), at **`/api/waitlist/export`**, behind the
  developer dashboard's gate: signed in as a `SOCRIA_DASHBOARD_ADMINS` admin,
  or in a browser that has passed `/dev/dashboard`'s two codes. Anyone else
  gets a 404.

## Ending it

- **Switch it off**: set `SOCRIA_TAKEOVER=off` on Vercel (Production) and
  redeploy. The landing comes back exactly as it was: every page, Logos 5 open
  to everyone, and `/api/access/enter` gone. Entries already issued simply stop
  mattering.
- **Remove it**: revert the commit that brought it. Everything it added is in
  its own files (`lib/takeover.ts`, `lib/campaign.ts`, `lib/campaign/`,
  `components/campaign/`, `app/api/access/enter/`, `lib/og/campaign-card.tsx`,
  this document, `test/takeover.test.mjs`). It also made small edits to
  `middleware.ts`, `app/page.tsx`, the OG route and `lib/rate-limit.ts`.

The sitemap, robots.txt and llms.txt are unchanged on purpose. The redirects
are temporary (307), so search engines keep the pages for when the site comes
back.
