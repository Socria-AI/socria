# Socria events: RSVP and attendance

A reusable system for Socria's in-person events. Each event has a public page and a free RSVP; at the event, attendees check themselves in by scanning a QR code at the door and typing the name or email they RSVP'd with. Staff have a door list as a fallback, admins get a dashboard, a private Google Sheet mirrors the registrations, and acquisition numbers keep confirmed results apart from estimates.

The first event is **Socria: In Public 002**, at `/events/in-public-002`. Its date is not confirmed, so the page says "To be announced". The target date is kept as a staff-only planning note until an admin sets and confirms the date.

## What is reused

| Need | Reused |
|---|---|
| Database | Supabase, through the service role, with deny-by-default RLS (`supabase/rls.sql`) |
| Admins | `SOCRIA_DASHBOARD_ADMINS`, the developer dashboard's allowlist, matched by verified email or Clerk id (`lib/dashboard/gate.ts`) |
| Email | `lib/email.ts` (Resend) on a new transactional `event` stream behind `EVENT_EMAILS` |
| Rate limiting | `lib/rate-limit.ts`, with new `rsvp` and `staff` pools |
| Attribution | first-touch UTM tags (`lib/first-touch.ts`, plus an `events` landing kind) and the anonymous first-party counter (`product_events`, plus `event_page_viewed`) |
| Crons | `vercel.json`, with a new daily `/api/cron/events` |
| Design | the app register: `.app-root`, the paper, ink and moss tokens, the serif display, the `ds` Label (`app/events/events.css`) |

No new npm dependency. Google Sheets is called over its REST API with a service-account JWT signed by `node:crypto`.

## Pieces

**Tables** (`supabase/schema.sql`, "Socria events"):

- `events`: one row per event. A date is public only when `date_confirmed` is true and `starts_at` is set; a check constraint enforces this.
- `event_registrations`: one row per person per event.
  - **Uniqueness:** unique on (event, email) and on (event, code).
  - **Secrets:** `token_hash` is the SHA-256 of the secret in the attendee's link; the secret itself is never stored.
  - **Attendance:** `attendance` is `registered` until staff confirm the person; then it is `attended`, with `checked_in_at` and `checked_in_by`.
  - **Consent:** `marketing_consent` is separate from registration, with its own `consent_at`.
- `event_sheet_sync`: per event, the Sheet mirror's lease, dirty flag, and last success and error.

**Routes**

| Route | Who | What |
|---|---|---|
| `POST /api/events/rsvp` | public, rate limited | register; returns the attendee's own confirmation and secret once |
| `POST /api/events/ticket` | holder of the secret | that one confirmation |
| `DELETE /api/events/ticket` | holder of the secret | cancel; deletes the registration |
| `GET /api/events/[id]/ics` | public | calendar file, only once the date is confirmed |
| `POST /api/events/checkin` | public, while self check-in is open | check in by the name or email used at RSVP |
| `POST /api/events/staff` | staff and admins | `lookup`, `checkin` (once), `undo`, `walkin` |
| `POST /api/events/admin` | admins | create a draft event; run the retention sweep |
| `PATCH`/`POST /api/events/admin/[id]` | admins | edit the event; `sync` the sheet; `delete` a registration |
| `GET /api/events/admin/[id]/export` | admins | CSV, the same columns as the sheet |
| `GET /api/cron/events` | Vercel cron (`CRON_SECRET`) | retention purge and sheet catch-up, daily |

**Pages**

- `/events/[id]`: the public page and RSVP. Mobile-first, with a sticky RSVP button on phones and share metadata from `lib/og-cards.ts`.
- `/events/[id]/ticket#t=…`: the saved confirmation.
- `/events/[id]/checkin`: the check-in page the venue QR code opens.
- `/events/admin`: the list of events. Staff get door links; admins also get a new-event form and the retention sweep.
- `/events/admin/[id]`: the admin dashboard.
- `/events/admin/[id]/door`: phone-first check-in.

## Check-in

RSVP and check-in are separate steps. At the event, **attendees check themselves in**:

1. An admin opens self check-in on the dashboard's **Check-in** tab when doors open, and closes it afterwards. While it is closed the page says check-in isn't open, so the link can't be used from home.
2. A QR code at the venue points to `/events/<id>/checkin`. Make it from the link on the Check-in tab.
3. The attendee types **the name or the email they RSVP'd with**: whatever they signed up with, UTA addresses included. Names match regardless of case, accents or spacing.
   - **One match:** they are checked in, once, recorded as `self`. Doing it again says they're already checked in.
   - **Two RSVPs share the name:** they're asked for their email instead.
   - **No RSVP:** nothing is created, and they're told to find the team at the door.
4. The RSVP confirmation and email tell people exactly this. There is no personal QR code.

**Fallback for staff:** the door list (`/events/admin/<id>/door`) lets staff and admins find someone by name or email and check them in, or add a walk-in who never RSVP'd.

**Trade-off:** checking in by name trusts the person at the form. Anyone who knows an attendee's name could check them in while check-in is open.

**Database:** the switch is the `self_checkin` column, added by the `alter table events add column if not exists self_checkin …` line in the events block of `supabase/schema.sql`. If you ran the block before this column existed, run it again.

## Google Sheets

The database is the source of truth; the sheet is a private copy for the team.

- **The tab.** Each event gets one tab, named by its id (`in-public-002`).
- **The columns.** Registration ID, Event, Full Name, Email, Interest, Other Interest, Acquisition Source, RSVP Timestamp, Attendance Status, Check-in Timestamp, Marketing Consent, Consent Timestamp, Registered Via.
- **How it syncs.** Every change (RSVP, check-in, undo, walk-in, cancellation, deletion, title edit) rewrites the tab from the database, after the response has gone. So a person always has exactly one row, a check-in updates that row in place, and deleted people disappear from the sheet.
- **Formula safety.** A cell that would start a formula is prefixed with `'`.
- **Concurrency.** A 90-second lease keeps two syncs from writing at once. A change made during a sync marks the event dirty, and the running sync goes round again.
- **Failures.** Google calls retry on 429 and 5xx. A failure is recorded and shown on the admin page, the change stays pending, and the daily cron, the next change or **Resync now** catches up. RSVPs never fail because of the sheet.
- **Your own notes.** Don't add your own columns to the event's tab: sync manages columns A–M and rewrites them. Put notes on a separate tab.

### Connecting it

1. In Google Cloud Console, pick or create a project and enable the **Google Sheets API**.
2. **IAM & Admin → Service accounts → Create service account**, with no roles needed. Open it, then **Keys → Add key → JSON**, and download the file.
3. Create a Google Sheet, for example "Socria event registrations". **Share** it with the service account's email (`…@….iam.gserviceaccount.com`) as **Editor**. Do not make it public or "anyone with the link".
4. In Vercel, under Project → Settings → Environment Variables (server-side, never `NEXT_PUBLIC_`), set:
   - `EVENTS_SHEET_ID`: the long id in the sheet's URL, `https://docs.google.com/spreadsheets/d/<THIS>/edit`.
   - `GOOGLE_SERVICE_ACCOUNT_JSON`: the key file's contents, raw or base64 (`base64 -w0 key.json`). Alternatively set `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`.
5. Redeploy, open `/events/admin/in-public-002` as an admin, and press **Resync now**.
   - **Success:** the panel shows "Last synced … · N rows".
   - **Failure:** the error says what went wrong: not shared with the service account, a wrong id, or a refused key.

**Until a real resync succeeds, the integration is not connected.** The admin page says "Not connected" or "no sync has succeeded yet" rather than implying otherwise.

## Privacy and security

- **What is collected.** Name and email are required; the two questions are optional. Marketing consent is a separate, unticked box with its own timestamp. Nothing creates an account or subscribes anyone.
- **Spam.** RSVPs are rate limited per address. A hidden field and a minimum fill time screen out bots. Cross-site posts are refused.
- **Nothing public lists attendees.**
  - **The attendee's link:** shows only their own registration.
  - **Door staff:** see a name, a masked email and the code.
  - **Admins:** see everything, read fresh and never cached or indexed.
  - **Everyone else:** gets a 404 or 403.
- **Analytics.** Analytics carry only the event id and link tags, never a person. Tokens live in fragments, never in URLs that are logged.
- **Deletion.**
  - **The attendee:** can cancel and delete from their confirmation.
  - **Admins:** can delete any registration.
  - **Retention:** registrations are deleted `EVENT_RETENTION_DAYS` (default 365) after the event.
  - **Account deletion:** deleting a Socria account deletes RSVPs under its verified emails. Account export includes them.
  - **The sheet:** every deletion also removes the row from the sheet.
- **Roles.** Staff access requires a signed-in Clerk identity with a verified email or user id in the allowlist. The developer dashboard's two-step code does not open event data.

## Acquisition analytics

On the admin page every number is labelled **Confirmed** or **Estimate**.

- **Confirmed:**
  - RSVPs, check-ins, walk-ins and opt-ins, from the registrations.
  - RSVP → attended: attended RSVPs ÷ RSVPs; walk-ins excluded.
  - Registrants whose email matches a **verified** email on a Socria account (Clerk), computed at read time and shown only in aggregate. The RSVP privacy note discloses this.
  - Of those accounts: how many were created after the RSVP, how many saved at least one conversation (first meaningful use), and how many were active again seven or more days after creation (counted only over accounts at least seven days old).
- **Estimate:**
  - Event page views, by link source, from the anonymous counter. These are views, not people, and they miss blocked scripts.
  - RSVPs per view.
  - Sign-ups whose first touch carried `utm_campaign=<event id>`. These count devices, and only where the visitor's country allows the first-touch note.

**Referral links.** The admin page builds links such as `/events/in-public-002?utm_source=instagram&utm_medium=social&utm_campaign=in-public-002`, with an optional `&ref=<code>` for a student organisation or person. Tags are tokens and never identify anyone.

## Test the whole flow

Automated:

- `npm test`, which includes:
  - `events.test.mjs`: the rules.
  - `events-e2e.test.mjs`: the real routes with an in-memory database and a fake Google, from RSVP through check-in, sync, cancellation and account deletion.
  - `account-data-complete.test.mjs`: deletion and export coverage.
- `npm run build`.

By hand, on a preview deployment with Supabase, Clerk and admin env set:

1. Open `/events/in-public-002` on a phone. RSVP with a personal address. Check that the confirmation explains how to check in, and that the consent box was unticked.
2. RSVP again with the same email; it is refused as already registered.
3. As an admin, open self check-in on the Check-in tab. Open `/events/in-public-002/checkin`, enter the name you RSVP'd under, and check that it says Welcome. Enter it again and check that it says already checked in.
4. On `/events/admin/in-public-002/door`, find someone by name, and add a walk-in without an email.
5. On `/events/admin/in-public-002`, check that the numbers, attendee list and search work, export the CSV, and set and confirm a date. Check that the public page shows it and the calendar file downloads.
6. With the Google variables set, press **Resync now** and check that the tab has one row per person. Check someone in or out and watch their row change in place.
7. From the attendee's confirmation, cancel. Check that the row leaves the admin list and the sheet.

Local browser runs without a real database: `node scripts/dev/fake-postgrest.mjs`, then start the app with `SUPABASE_URL=http://localhost:54321 SUPABASE_SERVICE_ROLE_KEY=dev`. This is a development stand-in only.
