// app/api/cron/lifecycle/route.ts
// GET — the daily lifecycle email run. Called by Vercel's cron (vercel.json).
//
// Three kinds go from here: day-3 and day-7, whose candidates the database
// picks out (lifecycle_candidates in supabase/schema.sql), and limit-chats,
// which was claimed by /api/logos/chat at the refusal and falls due a day
// later. welcome-one is the webhook's, not this route's.
//
// What this route will not do:
//
//   - Run without CRON_SECRET. A cron endpoint that anyone can GET is a
//     button that sends email to strangers, so an unset secret is a 503,
//     not an open door.
//   - Decide anything itself. Every send goes through decideLifecycle
//     (lib/lifecycle.ts) with the live plan and the live opt-out, even
//     though the query already filtered on both — the query is an index,
//     the decision is the rule.
//   - Send before claiming. The ledger row is inserted first; a colliding
//     run (Vercel does retry) gets 'already' and steps aside.
//   - Say who it emailed. The response is counts by kind; the analytics
//     event is the kind and 'cron'. No ids, no addresses, ever.
//
// With LIFECYCLE_EMAILS unset the run is a no-op that still answers 200, so
// a deployment that has the cron but not the decision to send is quiet
// rather than erroring every day.
//
// REHEARSAL. Vercel runs cron jobs on production only, so without help the
// first real execution of the candidate query would be the one that emails
// real people. Two aids: `?dry=1` runs the whole selection and decision and
// sends nothing, answering with the candidate counts per kind; and
// LIFECYCLE_TEST_USER_IDS, a comma-separated allow-list which, when set,
// restricts real sends to those accounts — so a preview can be pointed at a
// team member and nobody else.

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { clerkClient } from '@clerk/nextjs/server';
import { resolvePlanForRequest } from '@/lib/socria-one-server';
import { trackServer } from '@/lib/analytics-server';
import {
  emailBaseUrl,
  emailSecret,
  lifecycleEmailsOn,
  sendEmail,
} from '@/lib/email';
import {
  dayWindow,
  decideLifecycle,
  lifecycleCopy,
  lifecycleLink,
  resetDateFor,
  unsubscribeToken,
  unsubscribeUrl,
  type LifecycleKind,
} from '@/lib/lifecycle';
import {
  candidates,
  claimLifecycle,
  dueLimitChats,
  strandedWelcomes,
  isUnsubscribed,
  latestLogosSession,
  markSent,
  releaseClaim,
} from '@/lib/lifecycle-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Two hundred people per kind, each a Clerk read and a plan lookup. The
// platform's ceiling for this is the reason the per-kind cap exists.
export const maxDuration = 60;

/** How many of each kind one run will send. A backlog drains over days. */
const PER_KIND = 200;
/** Clerk's page size for getUserList by id. */
const CLERK_BATCH = 100;

type Counts = Record<string, number>;

function bump(c: Counts, k: string): void {
  c[k] = (c[k] ?? 0) + 1;
}

/** Constant-time bearer check; lengths first, since timingSafeEqual throws. */
function authorised(req: NextRequest, secret: string): boolean {
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const a = Buffer.from(token, 'utf8');
  const b = Buffer.from(secret, 'utf8');
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

/**
 * Primary email per user id, in batches of a hundred. A user Clerk does
 * not return — deleted since, or the lookup failed — simply has no address
 * and is skipped; the ledger row for them is released so nothing is
 * recorded as sent that was not.
 */
async function addressesFor(userIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < userIds.length; i += CLERK_BATCH) {
    const batch = userIds.slice(i, i + CLERK_BATCH);
    try {
      const { data } = await clerkClient().users.getUserList({ userId: batch, limit: CLERK_BATCH });
      for (const u of data) {
        const primary =
          u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId) ?? u.emailAddresses[0];
        if (primary?.emailAddress) out.set(u.id, primary.emailAddress);
      }
    } catch (e) {
      console.warn('lifecycle cron: clerk lookup failed for a batch', e instanceof Error ? e.message : '');
    }
  }
  return out;
}

interface SendJob {
  userId: string;
  kind: LifecycleKind;
  to: string;
  /** the most recent Logos session, when one is known — an id, never a title */
  sessionId?: string | null;
}

/**
 * Claim, send, record. The claim comes first and the record last, so at
 * every point where this could be interrupted the ledger says either
 * "nobody has sent this" or "somebody has" — never "sent" for an email that
 * did not go.
 */
async function claimAndSend(
  job: SendJob,
  ctx: { base: string; secret: string; now: number; req: NextRequest },
  counts: Counts
): Promise<void> {
  const claim = await claimLifecycle(job.userId, job.kind, { now: ctx.now });
  if (claim === 'already') return bump(counts, 'already');
  if (claim === 'unavailable') return bump(counts, 'unavailable');
  await sendClaimed(job, ctx, counts);
}

/** The send half, for a row that is already claimed (limit-chats). */
async function sendClaimed(
  job: SendJob,
  ctx: { base: string; secret: string; now: number; req: NextRequest },
  counts: Counts
): Promise<void> {
  const unsub = unsubscribeUrl(ctx.base, job.userId, unsubscribeToken(job.userId, ctx.secret));
  const copy = lifecycleCopy(job.kind, {
    link: lifecycleLink(job.kind, { base: ctx.base, sessionId: job.sessionId ?? null }),
    unsubscribeUrl: unsub,
    resetDate: resetDateFor(ctx.now),
  });
  const result = await sendEmail({
    to: job.to,
    subject: copy.subject,
    text: copy.text,
    html: copy.html,
    unsubscribeUrl: unsub,
  });
  if (!result.ok) {
    await releaseClaim(job.userId, job.kind);
    return bump(counts, 'failed');
  }
  await markSent(job.userId, job.kind, Date.now());
  bump(counts, 'sent');
  await trackServer('lifecycle_email_sent', { kind: job.kind, source: 'cron' }, ctx.req);
}

export async function GET(req: NextRequest) {
  const cronSecret = (process.env.CRON_SECRET || '').trim();
  if (!cronSecret) {
    return NextResponse.json({ error: 'Cron not configured' }, { status: 503 });
  }
  if (!authorised(req, cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // A dry run may proceed with the switch off: it sends nothing, and the
  // point of it is to see the selection on a deployment that does not send.
  const dry = req.nextUrl.searchParams.get('dry') === '1';
  if (!lifecycleEmailsOn() && !dry) {
    return NextResponse.json({ ok: true, off: true });
  }
  const secret = emailSecret() ?? (dry ? 'dry-run' : null);
  if (!secret) {
    return NextResponse.json({ ok: true, off: true, reason: 'unconfigured' });
  }

  const now = Date.now();
  const base = emailBaseUrl();
  const allow = new Set(
    (process.env.LIFECYCLE_TEST_USER_IDS || '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
  );
  const permitted = (userId: string) => allow.size === 0 || allow.has(userId);
  const ctx = { base, secret, now, req };
  const report: Record<string, Counts> = {};

  try {
    // ── day-3, day-7 ────────────────────────────────────────────────
    for (const kind of ['day-3', 'day-7'] as const) {
      const counts: Counts = {};
      report[kind] = counts;
      const { from, to } = dayWindow(kind, now);
      const found = await candidates(kind, from, to, now, PER_KIND);
      const addresses = await addressesFor(found.map((c) => c.userId));

      for (const c of found) {
        const to = addresses.get(c.userId);
        if (!to) {
          bump(counts, 'no-address');
          continue;
        }
        const [plan, unsubscribed] = await Promise.all([
          resolvePlanForRequest(req, c.userId),
          isUnsubscribed(c.userId),
        ]);
        const decision = decideLifecycle({
          kind,
          plan,
          unsubscribed,
          alreadySent: false, // the claim below is the real check
          firstSeenAt: c.firstAt,
          lastSeenAt: c.lastAt,
          now,
        });
        if (!decision.send) {
          bump(counts, decision.reason);
          continue;
        }
        if (!permitted(c.userId)) {
          bump(counts, 'not-in-allowlist');
          continue;
        }
        if (dry) {
          bump(counts, 'would-send');
          continue;
        }
        const sessionId = await latestLogosSession(c.userId);
        await claimAndSend({ userId: c.userId, kind, to, sessionId }, ctx, counts);
      }
    }

    // ── welcomes that were claimed and never sent ───────────────────
    {
      const kind = 'welcome-one' as const;
      const counts: Counts = {};
      report[kind] = counts;
      const stranded = await strandedWelcomes(now, PER_KIND);
      const addresses = await addressesFor(stranded.map((r) => r.userId));
      for (const row of stranded) {
        const [plan, unsubscribed] = await Promise.all([
          resolvePlanForRequest(req, row.userId),
          isUnsubscribed(row.userId),
        ]);
        const decision = decideLifecycle({
          kind,
          plan,
          unsubscribed,
          alreadySent: row.sentAt !== null,
          now,
        });
        if (!decision.send) {
          bump(counts, decision.reason);
          // They are no longer a member, or have said stop: the welcome is
          // never going. Leaving the row claimed would have it read and
          // refused every day from now on.
          if (decision.reason === 'not-member' || decision.reason === 'unsubscribed') {
            await releaseClaim(row.userId, kind);
          }
          continue;
        }
        if (!permitted(row.userId)) {
          bump(counts, 'not-in-allowlist');
          continue;
        }
        if (dry) {
          bump(counts, 'would-send');
          continue;
        }
        const to = addresses.get(row.userId);
        if (!to) {
          bump(counts, 'no-address');
          await releaseClaim(row.userId, kind);
          continue;
        }
        await sendClaimed({ userId: row.userId, kind, to }, ctx, counts);
      }
    }

    // ── limit-chats, a day after the refusal ────────────────────────
    {
      const kind = 'limit-chats' as const;
      const counts: Counts = {};
      report[kind] = counts;
      const due = await dueLimitChats(now, PER_KIND);
      const addresses = await addressesFor(due.map((r) => r.userId));

      for (const row of due) {
        const [plan, unsubscribed] = await Promise.all([
          resolvePlanForRequest(req, row.userId),
          isUnsubscribed(row.userId),
        ]);
        const decision = decideLifecycle({
          kind,
          plan,
          unsubscribed,
          alreadySent: row.sentAt !== null,
          refusedAt: row.createdAt,
          now,
        });
        if (!decision.send) {
          bump(counts, decision.reason);
          // A member, or someone who has said stop, will never receive this
          // one; leaving the row due would have it read and refused every
          // day until it crowded out someone who could. It goes. If they
          // lapse and meet the boundary again, that refusal claims afresh.
          if (decision.reason === 'member' || decision.reason === 'unsubscribed') {
            await releaseClaim(row.userId, kind);
          }
          continue;
        }
        if (!permitted(row.userId)) {
          bump(counts, 'not-in-allowlist');
          continue;
        }
        if (dry) {
          bump(counts, 'would-send');
          continue;
        }
        const to = addresses.get(row.userId);
        if (!to) {
          bump(counts, 'no-address');
          await releaseClaim(row.userId, kind);
          continue;
        }
        await sendClaimed({ userId: row.userId, kind, to }, ctx, counts);
      }
    }
  } catch (e) {
    // A failure mid-run leaves the ledger consistent (see claimAndSend);
    // tomorrow's run picks up whoever was not reached. Say so, in counts.
    console.error('lifecycle cron: run failed', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, report }, { status: 500 });
  }

  return NextResponse.json({ ok: true, dry, report });
}
