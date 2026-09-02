// app/api/stripe/checkout/route.ts
// POST → { url } — a Stripe Checkout session for Socria One.
//
// The price is read from the environment, never from the request: a client
// that could name its own price could name its own number.

import { NextRequest, NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { stripe, stripeConfigured, onePriceId, siteUrl, usableCustomer } from '@/lib/stripe';
import { isMissingCustomer, priceIdProblem, stripeFailure } from '@/lib/stripe-diagnosis';
import { getSubscription, isCompCustomer, tryUpsertSubscription } from '@/lib/subscriptions';
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

  // Named before Stripe is called, because Stripe reports both of these as a
  // missing price, which reads as though the price were deleted rather than
  // as the setup mistake it is.
  const misconfigured = priceIdProblem();
  if (misconfigured) {
    console.error('stripe checkout: misconfigured —', misconfigured);
    return NextResponse.json(
      { error: 'Billing is not configured correctly.', code: 'price_config', detail: misconfigured },
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
    //
    // And check it still exists. A stored id can outlive the customer it
    // names: test and live keys cannot see each other's customers, so an id
    // written while testing is dead the moment the deployment goes live, and
    // one deleted in the dashboard is dead immediately. Both surface as "No
    // such customer" from Checkout — after the sale has already failed, over
    // a row that was only ever a shortcut.
    let customerId: string | undefined =
      existing && !isCompCustomer(existing.customerId)
        ? (await usableCustomer(existing.customerId)) ?? undefined
        : undefined;

    // Our own table had nothing. Ask Stripe before making a new customer:
    // when the table is unreachable this is the ONLY thing standing between a
    // person who retries three times and three customer records with their
    // name on them. Search is eventually consistent, so it can miss one made
    // seconds ago — a duplicate is a mess to tidy, not a broken checkout, and
    // a failure here must not stop the sale either.
    if (!customerId) {
      try {
        const found = await s.customers.search({
          query: `metadata['clerkUserId']:'${userId}'`,
          limit: 1,
        });
        customerId = found.data[0]?.id;
      } catch (e) {
        console.warn('stripe checkout: customer search failed', e);
      }
    }

    if (!customerId) {
      // The email is a convenience on the Stripe customer, not a requirement.
      // Clerk being slow or unreachable is not a reason nobody can subscribe.
      let email: string | undefined;
      try {
        email = (await currentUser())?.emailAddresses?.[0]?.emailAddress;
      } catch (e) {
        console.warn('stripe checkout: could not read the email', e);
      }
      const customer = await s.customers.create({
        email,
        metadata: { clerkUserId: userId },
      });
      customerId = customer.id;
    }

    // Record the customer before checkout, so a webhook arriving before the
    // browser returns has someone to attribute it to.
    //
    // BEST EFFORT, and that is the whole point of this line. This used to
    // throw, which meant an unrun migration or an unreachable database turned
    // every attempt to subscribe into "Could not start checkout" — after
    // creating a Stripe customer, so each try also left one behind. It is
    // bookkeeping, and bookkeeping is not a reason to refuse somebody's
    // money. Nothing depends on it: the session below carries the user id in
    // client_reference_id and in both metadata bags, which is where the
    // webhook looks first. This row is its last-resort fallback, not its
    // source.
    await tryUpsertSubscription({ userId, customerId, status: 'incomplete' });

    const base = siteUrl(req);
    const open = (customer: string) =>
      s.checkout.sessions.create({
        mode: 'subscription',
        customer,
        line_items: [{ price: onePriceId(), quantity: 1 }],
        // Both sides carry the user id: the session for
        // checkout.session.completed, the subscription for every later
        // lifecycle event.
        client_reference_id: userId,
        metadata: { clerkUserId: userId },
        subscription_data: { metadata: { clerkUserId: userId } },
        allow_promotion_codes: true,
        success_url: `${base}/chat?one=welcome&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${base}/chat?one=cancelled`,
      });

    let session;
    try {
      session = await open(customerId);
    } catch (e) {
      // Last line of defence for a customer that died between being checked
      // and being used — or that came back from a search index still holding
      // one that has since gone. One retry with a customer we have just
      // created ourselves, and no further: a second failure is not about the
      // customer.
      if (!isMissingCustomer(e)) throw e;
      console.warn('stripe checkout: customer vanished mid-flight, making another');
      const fresh = await s.customers.create({ metadata: { clerkUserId: userId } });
      customerId = fresh.id;
      await tryUpsertSubscription({ userId, customerId, status: 'incomplete' });
      session = await open(customerId);
    }

    if (!session.url) {
      return NextResponse.json(
        { error: 'Could not start checkout.', code: 'no_session_url' },
        { status: 502 }
      );
    }
    return NextResponse.json({ url: session.url });
  } catch (e) {
    // Say what happened. Every failure in here used to report the same eleven
    // words, which meant the only way to find out why checkout was refusing
    // people was to read server logs the person seeing the error cannot
    // reach — so the same message covered a missing price, a test key on a
    // live deployment, and Stripe being down.
    const { code, detail } = stripeFailure(e);
    console.error('stripe checkout error:', code, detail, e);
    return NextResponse.json(
      { error: 'Could not start checkout.', code, ...(detail ? { detail } : {}) },
      { status: 500 }
    );
  }
}
