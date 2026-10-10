// app/api/logos/plan/route.ts
// GET → { plan, manageable } — what the server says this person holds.
//
// The client keeps a local belief so the UI doesn't flicker on load, but this
// is the answer that wins. It's what the page asks on mount and again after
// returning from Stripe.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { forgetPlanMemo, resolveBasePlanForRequest, resolvePlanForRequest } from '@/lib/socria-one-server';
import { promoSnapshot } from '@/lib/rewards/promo-access';
import { daysOf } from '@/lib/rewards/promo-engine';
import { getSubscription, isCompCustomer } from '@/lib/subscriptions';
import { mirrorEntitles, readStripeMirror, studentStatus } from '@/lib/socria-one-grant';
import {
  STUDENT_OFFER, eduDomainLabel, eduDomains, eduProgrammeOn, eduSchool, studentOfferOpen, warnIfEduOff,
} from '@/lib/socria-edu';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { userId } = auth();
  // A student's standing FIRST. The read that sees a newly verified
  // university address is the one that begins their free month
  // (lib/socria-edu.ts STUDENT_OFFER), and the plan below must already know
  // it — so somebody who has just typed the code arrives to Socria One, not
  // to the free tier for another half-minute of a remembered answer.
  // Says once per process when the programme is off here, so an absent
  // student panel can be told from a broken one.
  warnIfEduOff();
  const programme = eduProgrammeOn();
  const status = programme && userId ? await studentStatus(userId) : null;
  if (status?.began && userId) forgetPlanMemo(userId);
  const plan = await resolvePlanForRequest(req, userId);
  // PROMOTIONAL time from Socria Rewards, said apart from what they hold. `only` is the case the
  // surfaces must treat differently: Socria One that comes from a reward alone, which /one must
  // still sell and "Manage membership" has nothing behind.
  const base = plan === 'one' ? await resolveBasePlanForRequest(req, userId) : 'free';
  const snap = userId ? await promoSnapshot(userId) : null;
  const now = Date.now();
  const promo =
    snap && ((snap.until ?? 0) > now || snap.bankedMs > 0)
      ? {
          active: (snap.until ?? 0) > now,
          until: snap.until,
          daysLeft: daysOf(Math.max(0, (snap.until ?? 0) - now), 86_400_000),
          bankedDays: daysOf(snap.bankedMs, 86_400_000),
          only: plan === 'one' && base === 'free',
        }
      : undefined;
  // Only a real Stripe customer has anything to manage — an access-code or
  // complimentary unlock has no billing behind it and shouldn't be offered
  // a portal it can't open.
  //
  // The account mirror is consulted when the table gives nothing, for the
  // same reason the portal route searches Stripe: without it, an unreachable
  // subscriptions table hides the Manage billing button from every paying
  // customer, and somebody who cannot find how to cancel is somebody we are
  // quietly making it hard to leave.
  const sub = userId ? await getSubscription(userId) : null;
  const fromTable = !!sub?.customerId && !isCompCustomer(sub.customerId);
  const manageable =
    fromTable || (!sub && !!userId && mirrorEntitles(await readStripeMirror(userId)));
  // Student access, when the programme is switched on here — by
  // SOCRIA_EDU_DOMAINS, or by an open offer. `on` lets the surfaces mention it
  // at all; `email` is the verified address that qualified, so they can be
  // told WHICH one rather than asked to take it on trust; `month` is their
  // free month, running or over, so they can be told until when. Absent
  // entirely where the programme is off, so a deployment that has not opted
  // in says nothing about a programme it does not run.
  //
  // `hosts` is the same list as a machine-readable array. The label is prose
  // and reads as prose ("@mavs.uta.edu or @uta.edu"); the form that checks
  // what somebody typed needs the domains themselves, and parsing them back
  // out of the sentence would be a second, worse copy of eduDomains().
  const student = programme
    ? {
        on: true,
        domains: eduDomainLabel(),
        hosts: eduDomains(),
        // Null where the domains do not name one institution, and the copy
        // falls back to the general wording rather than guessing.
        school: eduSchool(),
        email: status?.email ?? null,
        month: status?.month ?? null,
        offer: { open: studentOfferOpen(), closes: STUDENT_OFFER.closes, days: STUDENT_OFFER.days },
      }
    : undefined;

  return NextResponse.json({
    plan,
    manageable,
    cancelAtPeriodEnd: !!sub?.cancelAtPeriodEnd,
    ...(student ? { student } : {}),
    ...(promo ? { promo } : {}),
  });
}
