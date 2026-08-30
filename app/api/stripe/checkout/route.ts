// app/api/stripe/checkout/route.ts
// POST → { url } — a Stripe Checkout session for Socria One.
//
// The price is read from the environment, never from the request: a client
// that could name its own price could name its own number.

import { NextRequest, NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { stripe, stripeConfigured, onePriceId, siteUrl } from '@/lib/stripe';
import { getSubscription, isCompCustomer, upsertSubscription } from '@/lib/subscriptions';
import { enforceRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // Subscribing is tied to an account — there has to be someone to bill and
  // someone to give it to. An access code is not a substitute here.
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: 'Sign in to subscribe.' }, { status: 401 });
  }
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  if (!stripeConfigured()) {
    return NextResponse.json(
      { error: 'Billing is not configured on this deployment.' },
      { status: 503 }
    );
  }

  try {
    const s = stripe();
    const existing = await getSubscription(userId);

    // Reuse the customer if we've seen them, so a second subscription doesn't
    // create a second customer record with the same person behind it. A comp
    // row's sentinel id is NOT a Stripe customer — someone comp'd who chooses
    // to pay gets a real customer created here, replacing the sentinel.
    let customerId =
      existing && !isCompCustomer(existing.customerId) ? existing.customerId : undefined;
    if (!customerId) {
      const user = await currentUser();
      const email = user?.emailAddresses?.[0]?.emailAddress;
      const customer = await s.customers.create({
        email,
        metadata: { clerkUserId: userId },
      });
      customerId = customer.id;
      // Record the customer now, before checkout — otherwise a webhook that
      // arrives before the browser returns has no user to attribute it to.
      await upsertSubscription({
        userId,
        customerId,
        status: 'incomplete',
      });
    }

    const base = siteUrl(req);
    const session = await s.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: onePriceId(), quantity: 1 }],
      // Both sides carry the user id: the session for checkout.session.completed,
      // the subscription for every later lifecycle event.
      client_reference_id: userId,
      metadata: { clerkUserId: userId },
      subscription_data: { metadata: { clerkUserId: userId } },
      allow_promotion_codes: true,
      success_url: `${base}/chat?one=welcome&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/chat?one=cancelled`,
    });

    if (!session.url) {
      return NextResponse.json({ error: 'Could not start checkout.' }, { status: 502 });
    }
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error('stripe checkout error:', e);
    return NextResponse.json({ error: 'Could not start checkout.' }, { status: 500 });
  }
}
