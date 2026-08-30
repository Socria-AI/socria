// app/api/stripe/webhook/route.ts
// POST — Stripe's lifecycle events. The only writer of subscription state.
//
// Three rules this route lives by:
//
//   1. VERIFY FIRST. The body is read raw and checked against the signing
//      secret before anything is parsed. An unverified body is not a webhook,
//      it is a stranger asking us to give somebody a subscription.
//
//   2. NEVER TRUST THE EVENT'S SHAPE. The user id is taken from metadata we
//      ourselves set at checkout, falling back to the customer we already have
//      on file. If neither resolves, the event is acknowledged and dropped
//      rather than guessed at.
//
//   3. ALWAYS 200 ON A HANDLED EVENT. Returning an error makes Stripe retry;
//      retries are only useful for failures we might recover from, not for
//      events we have decided are not ours.

import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { upsertSubscription, userForCustomer } from '@/lib/subscriptions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HANDLED = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
]);

function customerIdOf(v: string | { id: string } | null | undefined): string | null {
  if (!v) return null;
  return typeof v === 'string' ? v : v.id;
}

/** The period end lives on the item in current API versions. */
function periodEndOf(sub: Stripe.Subscription): number | null {
  const item = sub.items?.data?.[0] as { current_period_end?: number } | undefined;
  const legacy = (sub as unknown as { current_period_end?: number }).current_period_end;
  return item?.current_period_end ?? legacy ?? null;
}

async function resolveUserId(
  metadata: Stripe.Metadata | null | undefined,
  customerId: string | null
): Promise<string | null> {
  const fromMeta = metadata?.clerkUserId;
  if (typeof fromMeta === 'string' && fromMeta) return fromMeta;
  if (customerId) return userForCustomer(customerId);
  return null;
}

async function applySubscription(sub: Stripe.Subscription): Promise<void> {
  const customerId = customerIdOf(sub.customer);
  const userId = await resolveUserId(sub.metadata, customerId);
  if (!userId || !customerId) {
    console.warn('stripe webhook: no user for subscription', sub.id);
    return;
  }
  await upsertSubscription({
    userId,
    customerId,
    subscriptionId: sub.id,
    status: sub.status,
    priceId: sub.items?.data?.[0]?.price?.id ?? null,
    currentPeriodEnd: periodEndOf(sub),
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
  });
}

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('stripe webhook: STRIPE_WEBHOOK_SECRET not set');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  // Raw body — parsing it first would change the bytes the signature covers.
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, signature, secret);
  } catch (e) {
    console.error('stripe webhook: bad signature', e);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  if (!HANDLED.has(event.type)) {
    return NextResponse.json({ received: true, ignored: event.type });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const customerId = customerIdOf(session.customer);
      const userId =
        session.client_reference_id ||
        (await resolveUserId(session.metadata, customerId));
      const subId = customerIdOf(session.subscription);

      if (userId && customerId) {
        // Read the subscription back rather than inferring its state from the
        // session: the session says a payment happened, the subscription says
        // what they actually now hold.
        if (subId) {
          const sub = await stripe().subscriptions.retrieve(subId);
          await applySubscription({ ...sub, metadata: { ...sub.metadata, clerkUserId: userId } });
        } else {
          await upsertSubscription({ userId, customerId, status: 'active' });
        }
      } else {
        console.warn('stripe webhook: completed session with no user', session.id);
      }
    } else {
      await applySubscription(event.data.object as Stripe.Subscription);
    }
  } catch (e) {
    // A failure here IS worth a retry — the event was real and we couldn't
    // record it, which is exactly the case Stripe's backoff exists for.
    console.error('stripe webhook: handler failed', event.type, e);
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
