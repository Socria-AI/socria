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
//
//   4. WRITE THE ENTITLEMENT TWICE, AND WRITE IT TO THE ACCOUNT FIRST. The
//      subscriptions table is a projection of Stripe that lives in a
//      migration; the Clerk mirror needs no schema at all. If only one of
//      them can be written, it has to be the one that decides whether the
//      person who just paid gets what they paid for. The table write still
//      happens, and still returns 500 so Stripe retries it — but somebody
//      being charged and handed nothing is not a failure worth being tidy
//      about.

import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { recordAttribution, upsertSubscription, userForCustomer } from '@/lib/subscriptions';
import { writeStripeMirror } from '@/lib/socria-one-grant';
import { attributionFromMetadata, type Attribution } from '@/lib/checkout-attribution';
import { trackServer } from '@/lib/analytics-server';
import { tenureBucket } from '@/lib/analytics';
import { clerkClient } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import { forgetPlanMemo } from '@/lib/socria-one-server';
import { emailBaseUrl, emailSecret, sendEmail, withTimeout } from '@/lib/email';

/** How long the welcome may take inside the webhook. Stripe allows far more. */
const WELCOME_MS = 6000;
import { lifecycleCopy, lifecycleLink, unsubscribeToken, unsubscribeUrl } from '@/lib/lifecycle';
import { claimLifecycle, isUnsubscribed, markSent, releaseClaim } from '@/lib/lifecycle-store';

/**
 * How long this person had been thinking here before they paid, bucketed.
 *
 * Best effort and shape only: a query for the earliest conversation, turned
 * into one of five words. It answers "do people pay on day one or after a
 * month", which decides where every other effort in this file should go.
 */
async function tenureFor(userId: string, now: number): Promise<string> {
  try {
    const { data } = await supabaseAdmin()
      .from('conversations')
      .select('created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    const raw = (data as { created_at?: unknown } | null)?.created_at;
    const first = raw ? new Date(String(raw)).getTime() : NaN;
    if (!Number.isFinite(first)) return 'unknown';
    return tenureBucket(Math.floor((now - first) / 86_400_000));
  } catch {
    return 'unknown';
  }
}

/**
 * The welcome, after the entitlement is written and never in its way.
 *
 * Claimed in the ledger before it is sent, so Stripe redelivering this event
 * sends one welcome and not two; bounded by RACE_MS, because Stripe is
 * waiting for a 200 and an email is the least important thing happening
 * here; and wrapped so that nothing in it can change the response.
 */
async function sendWelcome(userId: string, attribution: Attribution, req: NextRequest): Promise<'done'> {
  try {
    const secret = emailSecret();
    if (!secret) return 'done';
    if (await isUnsubscribed(userId)) return 'done';
    const claim = await claimLifecycle(userId, 'welcome-one');
    if (claim !== 'claimed') return 'done';

    let to = '';
    try {
      const u = await clerkClient().users.getUser(userId);
      to = (u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId) ?? u.emailAddresses[0])?.emailAddress ?? '';
    } catch {}
    if (!to) {
      await releaseClaim(userId, 'welcome-one');
      return 'done';
    }

    const base = emailBaseUrl();
    const unsub = unsubscribeUrl(base, userId, unsubscribeToken(userId, secret));
    const copy = lifecycleCopy('welcome-one', {
      link: lifecycleLink('welcome-one', { base, surface: attribution.surface ?? null }),
      unsubscribeUrl: unsub,
    });
    const result = await sendEmail({ to, subject: copy.subject, text: copy.text, html: copy.html, unsubscribeUrl: unsub });
    if (!result.ok) {
      await releaseClaim(userId, 'welcome-one');
      return 'done';
    }
    await markSent(userId, 'welcome-one');
    await trackServer('lifecycle_email_sent', { kind: 'welcome-one', source: 'webhook' }, req);
  } catch (e) {
    console.warn('stripe webhook: welcome email failed', e instanceof Error ? e.message : '');
  }
  return 'done';
}

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
  // The instance that took the payment must not keep saying 'free' for
  // half a minute from its memo.
  forgetPlanMemo(userId);

  // The account first — see rule 4. This is a mirror of the subscription's
  // CURRENT state, so a cancellation revokes through it exactly as it revokes
  // through the table.
  await writeStripeMirror(userId, {
    status: sub.status,
    periodEnd: periodEndOf(sub),
  });

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
          // No subscription on the session — rare, but the payment happened,
          // so the entitlement is written the same way round.
          await writeStripeMirror(userId, { status: 'active', periodEnd: null });
          await upsertSubscription({ userId, customerId, status: 'active' });
        }

        // The event the funnel was missing. Everything up to here was a
        // prompt being shown or pressed; this is the payment landing, counted
        // against the trigger that led to it — carried through the session's
        // metadata from the checkout route and re-validated on the way back,
        // because metadata is editable in the dashboard. Bookkeeping, after
        // the entitlement: neither of these may make the webhook fail.
        const attribution = attributionFromMetadata(session.metadata as Record<string, unknown>);
        forgetPlanMemo(userId);
        await recordAttribution(userId, attribution);
        await trackServer(
          'one_subscribed',
          {
            trigger: attribution.trigger,
            surface: attribution.surface,
            category: attribution.category,
            intent: attribution.intent,
            // First touch when there was one (an email, the Explore page);
            // otherwise where the event was counted from.
            source: attribution.source ?? 'webhook',
            tenure: await tenureFor(userId, Date.now()),
            plan: 'one',
          },
          req
        );
        // Last, and bounded. Stripe waits a good while for a 200, so the
        // welcome gets a few seconds rather than the chat route's moment —
        // a Clerk read and a provider POST fit comfortably. If it still runs
        // out, the claim is handed back: the function may be frozen the
        // instant this returns, and a claim left standing with nothing sent
        // would be a welcome that never goes.
        const sent = await withTimeout(sendWelcome(userId, attribution, req), WELCOME_MS, 'timeout' as const);
        if (sent === 'timeout') await releaseClaim(userId, 'welcome-one').catch(() => false);
      } else {
        console.warn('stripe webhook: completed session with no user', session.id);
      }
    } else {
      const sub = event.data.object as Stripe.Subscription;
      await applySubscription(sub);
      // The other end of the funnel. Attribution rides on the subscription's
      // own metadata (set at checkout), so a cancellation is counted against
      // the same trigger that earned the subscription — which is how a
      // trigger that converts well but churns fast becomes visible.
      //
      // Scheduling a cancellation in the portal is the one moment a save is
      // possible, and the portal asks why. Stripe's `feedback` is a fixed
      // enum ('too_expensive', 'unused', …); the free-text `comment` beside
      // it is a person's words and never leaves Stripe.
      if (event.type === 'customer.subscription.updated') {
        const prev = (event.data as { previous_attributes?: { cancel_at_period_end?: boolean } })
          .previous_attributes;
        if (sub.cancel_at_period_end && prev && prev.cancel_at_period_end === false) {
          const attribution = attributionFromMetadata(sub.metadata as Record<string, unknown>);
          const feedback = (sub as { cancellation_details?: { feedback?: unknown } }).cancellation_details
            ?.feedback;
          await trackServer(
            'one_cancel_scheduled',
            {
              trigger: attribution.trigger,
              surface: attribution.surface,
              feedback: typeof feedback === 'string' ? feedback : undefined,
              plan: 'one',
              source: 'webhook',
            },
            req
          );
        }
      }
      if (event.type === 'customer.subscription.deleted') {
        const attribution = attributionFromMetadata(sub.metadata as Record<string, unknown>);
        await trackServer(
          'one_cancelled',
          {
            trigger: attribution.trigger,
            surface: attribution.surface,
            plan: 'free',
            source: 'webhook',
          },
          req
        );
      }
    }
  } catch (e) {
    // A failure here IS worth a retry — the event was real and we couldn't
    // record it, which is exactly the case Stripe's backoff exists for.
    console.error('stripe webhook: handler failed', event.type, e);
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
