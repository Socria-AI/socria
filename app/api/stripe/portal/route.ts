// app/api/stripe/portal/route.ts
// POST → { url } — the Stripe billing portal.
//
// Cancelling, changing card, reading invoices: all of it belongs to the person,
// and none of it should require asking us. Socria never builds its own
// cancellation flow — the portal is the honest door.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { stripe, stripeConfigured, siteUrl } from '@/lib/stripe';
import { getSubscription, isCompCustomer } from '@/lib/subscriptions';
import { enforceRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  if (!stripeConfigured()) {
    return NextResponse.json({ error: 'Billing is not configured.' }, { status: 503 });
  }

  const sub = await getSubscription(userId);
  if (!sub?.customerId || isCompCustomer(sub.customerId)) {
    return NextResponse.json({ error: 'No subscription to manage.' }, { status: 404 });
  }

  try {
    const session = await stripe().billingPortal.sessions.create({
      customer: sub.customerId,
      return_url: `${siteUrl(req)}/logos`,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error('stripe portal error:', e);
    return NextResponse.json({ error: 'Could not open billing.' }, { status: 500 });
  }
}
