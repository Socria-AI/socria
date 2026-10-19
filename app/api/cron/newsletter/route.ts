// app/api/cron/newsletter/route.ts
// GET — the newsletter's schedule. Called daily by Vercel's cron (vercel.json).
//
// One approved issue every NEWSLETTER_EVERY_DAYS days (two by default), in
// the order they are written in lib/newsletter-issues.ts. Each run does one
// of three things (lib/newsletter.ts planNewsletter):
//   continue  the issue that is going out now has days left: send it to
//             whoever has not had it yet (a run is a bounded batch, and a
//             new subscriber gets the current issue too);
//   start     its days are up: begin the next approved issue nobody has had;
//   nothing   no approved issue is waiting. Nothing is written for it, and
//             nothing is sent — the schedule never invents an issue.
//
// The sending is lib/newsletter-send.ts — the same code the hand-send route
// uses — so the claim-before-send ledger, the address rules and the
// unsubscribe link are exactly the same, and the two can never send one
// person the same issue twice.
//
// Off unless NEWSLETTER_EMAILS=on, and then still a send only when everything
// a send needs is set (the issue's checks, EMAIL_SECRET, RESEND_API_KEY,
// NEWSLETTER_POSTAL_ADDRESS) — what is missing is named in the answer.
// `?dry=1` rehearses: the plan and who would get it, nothing sent, nothing
// claimed, and it works with the switch off. The answer is counts.

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { newsletterEmailsOn } from '@/lib/email';
import { firstClaimedAt } from '@/lib/lifecycle-store';
import { everyDays, issueKind, isReady, planNewsletter } from '@/lib/newsletter';
import { NEWSLETTER_ISSUES } from '@/lib/newsletter-issues';
import { runIssue } from '@/lib/newsletter-send';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** A run sends as many as fit in its time budget (lib/newsletter-send.ts), up to this. */
const RUN_LIMIT = 100;

function authorised(req: NextRequest, secret: string): boolean {
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const a = Buffer.from(token, 'utf8');
  const b = Buffer.from(secret, 'utf8');
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  const cronSecret = (process.env.CRON_SECRET || '').trim();
  if (!cronSecret) return NextResponse.json({ error: 'Cron not configured' }, { status: 503 });
  if (!authorised(req, cronSecret)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const dry = req.nextUrl.searchParams.get('dry') === '1';
  if (!newsletterEmailsOn() && !dry) return NextResponse.json({ ok: true, off: true });

  // When each issue began going out. An issue sent by hand counts too — even
  // to one person with `only` — so a hand send starts that issue's turn, and
  // the schedule carries on from it rather than sending two in one window.
  const startedAt = new Map<string, number>();
  for (const i of NEWSLETTER_ISSUES) {
    const first = await firstClaimedAt(issueKind(i.id));
    if (!first) return NextResponse.json({ ok: false, error: 'The ledger could not be read, so nothing was sent.' }, { status: 503 });
    if (first.at !== null) startedAt.set(i.id, first.at);
  }

  const days = everyDays(process.env.NEWSLETTER_EVERY_DAYS);
  const now = Date.now();
  const step = planNewsletter({ issues: NEWSLETTER_ISSUES, startedAt, now, everyDays: days });
  const queue = NEWSLETTER_ISSUES.filter((i) => isReady(i) && !startedAt.has(i.id)).map((i) => i.id);

  if (step.action === 'nothing' || step.action === 'wait') {
    return NextResponse.json({
      ok: true,
      mode: dry ? 'rehearsal' : 'send',
      everyDays: days,
      action: step.action,
      ...(step.action === 'nothing' ? { reason: step.reason } : { current: step.current.id, nextAt: new Date(step.nextAt).toISOString() }),
      waiting: queue,
    });
  }

  const run = await runIssue(step.issue, { send: !dry, limit: RUN_LIMIT });
  if (!run.ok) return NextResponse.json({ ok: false, action: step.action, issue: step.issue.id, error: run.error, ...(run.missing ? { missing: run.missing } : {}) }, { status: run.status });
  const { preview: _preview, ...counts } = run;
  return NextResponse.json({
    ...counts,
    everyDays: days,
    action: step.action,
    waiting: queue.filter((id) => id !== step.issue.id),
  });
}
