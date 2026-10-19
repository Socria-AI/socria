// app/api/email/newsletter/route.ts
// POST — send one issue of the newsletter by hand, a batch at a time; or rehearse it.
//
// Issues also go on a schedule — one approved issue every other day, from
// app/api/cron/newsletter. This route is for everything a person does by
// hand: rehearsing an issue before it is approved, sending one to yourself,
// or sending one now instead of waiting for its turn. Both use the same
// sender (lib/newsletter-send.ts), so a hand send and a scheduled send can
// never give anyone a second copy.
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
import { findIssue } from '@/lib/newsletter';
import { NEWSLETTER_ISSUES } from '@/lib/newsletter-issues';
import { runIssue } from '@/lib/newsletter-send';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const LIMIT_DEFAULT = 40;
const LIMIT_MAX = 50;

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

  const run = await runIssue(issue, { send, only, limit });
  if (!run.ok) return refuse(run.status, run.error, run.missing ? { missing: run.missing } : {});
  return NextResponse.json(run);
}
