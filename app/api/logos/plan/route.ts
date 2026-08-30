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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { userId } = auth();
  const plan = await resolvePlanForRequest(req, userId);
  // Only a real Stripe customer has anything to manage — an access-code or
  // complimentary unlock has no billing behind it and shouldn't be offered
  // a portal it can't open.
  const sub = userId ? await getSubscription(userId) : null;
  return NextResponse.json({
    plan,
    manageable: !!sub?.customerId && !isCompCustomer(sub.customerId),
    cancelAtPeriodEnd: !!sub?.cancelAtPeriodEnd,
  });
}
