// app/api/email/newsletter/route.ts
// POST — send one issue of the newsletter, a batch at a time; or rehearse it.
//
// Pressed by a person, never by a schedule. There is no cron for this route
// and there must not be one: an issue goes when somebody decides it goes.
//
//   curl -X POST "https://socria.app/api/email/newsletter" \
//     -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" \
//     -d '{"issue":"2026-10-documents"}'
//
// The body:
//   issue   the id of an issue in lib/newsletter-issues.ts. That list is the
//           only source of words this route sends — nothing in the body
//           becomes copy, so holding the secret is not a way to mail anyone
//           something that was not committed and reviewed first.
//   send    true to send. Anything else is a REHEARSAL: the whole selection
//           runs, the issue is rendered, the answer says what a send would
//           do and what one still needs, and nothing is sent or claimed.
//   only    user ids to narrow the run to — yourself, before everyone.
//   limit   how many people this call sends to (default 40, at most 50).
//           A send is a batch: call again until the answer says `done`.
//           Each person's copy is claimed in the ledger before it goes, so
//           calls that overlap, or a call repeated after a timeout, never
//           send anyone a second copy.
//
// A real send needs, beyond the secret: an issue that is not a draft and has
// no problems (lib/newsletter.ts issueProblems), NEWSLETTER_EMAILS=on,
// EMAIL_SECRET (the unsubscribe links), RESEND_API_KEY, and
// NEWSLETTER_POSTAL_ADDRESS. All of them are checked before anyone is
// claimed, and whatever is missing is named in a 409 — not discovered
// halfway down the list.
//
// The answer is counts. Never an address, and never an id.

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { addressesFor } from '@/lib/email-recipients';
import {
  emailBaseUrl,
  emailSecret,
  newsletterEmailsOn,
  newsletterPostalAddress,
  sendEmail,
} from '@/lib/email';
import { unsubscribeToken } from '@/lib/lifecycle';
import { claimLifecycle, idsWithKind, markSent, releaseClaim } from '@/lib/lifecycle-store';
import {
  NEWSLETTER_KIND,
  decideNewsletter,
  findIssue,
  issueKind,
  issueProblems,
  newsletterCopy,
  newsletterUnsubscribeUrl,
} from '@/lib/newsletter';
import { NEWSLETTER_ISSUES } from '@/lib/newsletter-issues';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const LIMIT_DEFAULT = 40;
const LIMIT_MAX = 50;
/** Clerk's page size, and the size of each look-up of addresses. */
const CHUNK = 100;
/** The provider's default pace is two requests a second; stay under it. */
const PACE_MS = 550;
/** Start nothing new after this long, so the call answers inside its limit. */
const BUDGET_MS = 45_000;

type Counts = Record<string, number>;

function bump(c: Counts, k: string): void {
  c[k] = (c[k] ?? 0) + 1;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Constant-time bearer check; lengths first, since timingSafeEqual throws. */
function authorised(req: NextRequest, secret: string): boolean {
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const a = Buffer.from(token, 'utf8');
  const b = Buffer.from(secret, 'utf8');
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

function refuse(status: number, error: string, extra: Record<string, unknown> = {}): NextResponse {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

export async function POST(req: NextRequest) {
  const cronSecret = (process.env.CRON_SECRET || '').trim();
  if (!cronSecret) return refuse(503, 'Not configured');
  if (!authorised(req, cronSecret)) return refuse(401, 'Unauthorized');

  const body = await req.json().catch(() => null);
  const issue = findIssue(NEWSLETTER_ISSUES, body?.issue);
  if (!issue) return refuse(404, 'No issue with that id in lib/newsletter-issues.ts.');
  const send = body?.send === true;

  let only: Set<string> | null = null;
  if (body?.only !== undefined) {
    if (!Array.isArray(body.only) || !body.only.every((v: unknown) => typeof v === 'string' && v && v.length <= 64)) {
      return refuse(400, '`only` is a list of user ids.');
    }
    only = new Set(body.only as string[]);
  }
  const asked = Number(body?.limit);
  const limit = Number.isInteger(asked) && asked > 0 ? Math.min(asked, LIMIT_MAX) : LIMIT_DEFAULT;

  // What a real send needs, named — so a rehearsal can say what is missing,
  // and a send refuses before it claims anybody.
  const secret = emailSecret();
  const postal = newsletterPostalAddress();
  const missing: string[] = [];
  if (issue.draft) missing.push('the issue is marked draft');
  for (const p of issueProblems(issue)) missing.push(`the issue's ${p}`);
  if (!newsletterEmailsOn()) missing.push('NEWSLETTER_EMAILS=on');
  if (!secret) missing.push('EMAIL_SECRET');
  if (!(process.env.RESEND_API_KEY || '').trim()) missing.push('RESEND_API_KEY');
  if (!postal) missing.push('NEWSLETTER_POSTAL_ADDRESS');
  if (send && missing.length) return refuse(409, 'Nothing was sent: a send needs all of these.', { missing });

  const kind = issueKind(issue.id);
  const [subs, claimed] = await Promise.all([idsWithKind(NEWSLETTER_KIND), idsWithKind(kind)]);
  if (!subs || !claimed) return refuse(503, 'The ledger could not be read, so nobody was sent anything.');

  const have = new Set(claimed.ids);
  const alreadyHave = subs.ids.filter((id) => have.has(id)).length;
  let pending = subs.ids.filter((id) => !have.has(id));
  if (only) pending = pending.filter((id) => only!.has(id));

  // A draft never sends — a send of one was refused above — so a rehearsal
  // decides as if it were ready, and counts what a send would do.
  const deciding = send ? issue : { ...issue, draft: false };
  const base = emailBaseUrl();
  const counts: Counts = {};
  const started = Date.now();
  let attempts = 0;
  let last = 0;
  let done = true;

  scan: for (let i = 0; i < pending.length; i += CHUNK) {
    if ((send && attempts >= limit) || Date.now() - started > BUDGET_MS) {
      done = false;
      break;
    }
    const chunk = pending.slice(i, i + CHUNK);
    const addresses = await addressesFor(chunk);
    for (const userId of chunk) {
      if ((send && attempts >= limit) || Date.now() - started > BUDGET_MS) {
        done = false;
        break scan;
      }
      const d = decideNewsletter({ issue: deciding, subscribed: true, alreadySent: false, address: addresses.get(userId) ?? null });
      if (!d.send) {
        bump(counts, d.reason);
        continue;
      }
      if (!send) {
        bump(counts, 'would-send');
        continue;
      }

      attempts++;
      const claim = await claimLifecycle(userId, kind);
      if (claim === 'already') {
        bump(counts, 'already-sent');
        continue;
      }
      if (claim === 'unavailable') {
        // The ledger stopped answering: nothing more can be promised once-ever.
        bump(counts, 'unavailable');
        done = false;
        break scan;
      }
      const unsub = newsletterUnsubscribeUrl(base, userId, unsubscribeToken(userId, secret!));
      const copy = newsletterCopy(issue, { base, unsubscribeUrl: unsub, postalAddress: postal! });
      if (!copy) {
        await releaseClaim(userId, kind);
        bump(counts, 'not-rendered');
        done = false;
        break scan;
      }
      const wait = PACE_MS - (Date.now() - last);
      if (last && wait > 0) await sleep(wait);
      last = Date.now();
      const result = await sendEmail({
        to: d.to,
        subject: copy.subject,
        text: copy.text,
        html: copy.html,
        unsubscribeUrl: unsub,
        stream: 'newsletter',
      });
      if (!result.ok) {
        await releaseClaim(userId, kind);
        bump(counts, 'failed');
        continue;
      }
      await markSent(userId, kind, Date.now());
      bump(counts, 'sent');
    }
  }

  // A rehearsal shows the words, with a stand-in where each person's own
  // unsubscribe link and the postal address go.
  const preview = send
    ? undefined
    : newsletterCopy(
        deciding,
        {
          base,
          unsubscribeUrl: `${base}/api/email/unsubscribe?u=USER&t=TOKEN&l=newsletter`,
          postalAddress: postal ?? '[NEWSLETTER_POSTAL_ADDRESS is not set]',
        }
      );

  return NextResponse.json({
    ok: true,
    mode: send ? 'send' : 'rehearsal',
    issue: issue.id,
    subscribers: subs.ids.length,
    alreadyHave,
    pending: pending.length,
    counts,
    done,
    ...(subs.capped || claimed.capped ? { capped: true } : {}),
    missing,
    ...(preview ? { preview } : {}),
  });
}
