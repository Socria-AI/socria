// app/api/logos/plan/route.ts
// GET → { plan, manageable } — what the server says this person holds.
//
// The client keeps a local belief so the UI doesn't flicker on load, but this
// is the answer that wins. It's what the page asks on mount and again after
// returning from Stripe.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { resolvePlanForRequest } from '@/lib/socria-one-server';
import { getSubscription, isCompCustomer } from '@/lib/subscriptions';
import { mirrorEntitles, readStripeMirror, studentEmail } from '@/lib/socria-one-grant';
import { eduDomainLabel, eduProgrammeOn } from '@/lib/socria-edu';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { userId } = auth();
  const plan = await resolvePlanForRequest(req, userId);
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
  // Student access, when the programme is switched on here. `on` lets the
  // surfaces mention it at all; `email` is the verified address that
  // qualified, so they can be told WHICH one rather than asked to take it on
  // trust. Absent entirely where SOCRIA_EDU_DOMAINS is unset, so a deployment
  // that has not opted in says nothing about a programme it does not run.
  const student = eduProgrammeOn()
    ? { on: true, domains: eduDomainLabel(), email: userId ? await studentEmail(userId) : null }
    : undefined;

  return NextResponse.json({
    plan,
    manageable,
    cancelAtPeriodEnd: !!sub?.cancelAtPeriodEnd,
    ...(student ? { student } : {}),
  });
}
