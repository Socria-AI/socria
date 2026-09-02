// app/api/stripe/diagnose/route.ts
// GET → a checklist of why billing is or is not working.
//
// This exists because "Could not start checkout." was reported twice with no
// way to tell which of six unrelated causes it was. Every one of them is a
// fact about configuration that can be checked WITHOUT creating a customer,
// opening a session, or charging anybody — so it should be possible to ask,
// rather than to attempt a purchase and read the wreckage.
//
// Signed-in only, and it exposes nothing the checkout route would not already
// tell the same person when it fails: whether the key works, whether the
// price exists and is the right shape, and which mode each is in. No key, no
// secret, and no other account's anything. Ids of prices are the sort of
// thing that appears in client-side Stripe integrations; keys are redacted
// wherever they might appear.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { stripe, stripeConfigured, siteUrl } from '@/lib/stripe';
import { priceIdProblem, stripeFailure } from '@/lib/stripe-diagnosis';
import { getSubscription } from '@/lib/subscriptions';
import { enforceRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Check = { name: string; ok: boolean; note: string };

export async function GET(req: NextRequest) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  }
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  const checks: Check[] = [];
  const add = (name: string, ok: boolean, note: string) => checks.push({ name, ok, note });

  // ── the environment ──────────────────────────────────────────────
  const key = process.env.STRIPE_SECRET_KEY ?? '';
  const live = key.startsWith('sk_live_');
  const test = key.startsWith('sk_test_');
  add(
    'STRIPE_SECRET_KEY',
    !!key,
    !key ? 'Not set.' : live ? 'Live key.' : test ? 'Test key.' : 'Set, but not in a shape Stripe uses.'
  );

  const priceProblem = priceIdProblem();
  add('STRIPE_PRICE_SOCRIA_ONE', !priceProblem, priceProblem ?? 'Looks like a price id.');

  add(
    'STRIPE_WEBHOOK_SECRET',
    !!process.env.STRIPE_WEBHOOK_SECRET,
    process.env.STRIPE_WEBHOOK_SECRET
      ? 'Set. Checkout works without it — but nobody becomes a member without it, because the webhook is what records the subscription.'
      : 'NOT SET. Checkout will open and payment will succeed, and the subscription will never be recorded.'
  );

  const base = siteUrl(req);
  let urlOk = false;
  try {
    const u = new URL(base);
    urlOk = u.protocol === 'https:' || u.hostname === 'localhost';
  } catch {
    urlOk = false;
  }
  add(
    'Return URL',
    urlOk,
    urlOk ? base : `${base} — Stripe rejects a success_url that is not a valid absolute URL.`
  );

  if (!stripeConfigured()) {
    return NextResponse.json({ ok: false, checks, verdict: 'Billing is not configured.' });
  }

  // ── Stripe itself ────────────────────────────────────────────────
  let priceOk = false;
  try {
    const price = await stripe().prices.retrieve(process.env.STRIPE_PRICE_SOCRIA_ONE!);
    const recurring = !!price.recurring;
    priceOk = price.active && recurring;
    add(
      'The price, at Stripe',
      priceOk,
      [
        price.active ? 'active' : 'ARCHIVED — reactivate it or point at a live one',
        recurring
          ? `recurring (${price.recurring?.interval})`
          : 'ONE-OFF — checkout runs in subscription mode and needs a recurring price',
        price.currency?.toUpperCase(),
        typeof price.unit_amount === 'number' ? (price.unit_amount / 100).toFixed(2) : '',
      ]
        .filter(Boolean)
        .join(' · ')
    );
  } catch (e) {
    const { code, detail } = stripeFailure(e);
    add(
      'The price, at Stripe',
      false,
      `${code}${detail ? ` — ${detail}` : ''}. A price that exists in the other mode reads exactly like this: test keys cannot see live prices, and live keys cannot see test ones.`
    );
  }

  // ── our own record ───────────────────────────────────────────────
  // Reachability only. A missing table no longer breaks checkout, but it does
  // mean the free tier is unmetered, so it is worth saying out loud.
  let store = false;
  try {
    await getSubscription(userId);
    store = true;
  } catch {
    store = false;
  }
  add(
    'The subscriptions table',
    store,
    store
      ? 'Reachable.'
      : 'Unreachable. Checkout still works and a paid subscription is mirrored onto the account — but run supabase/schema.sql, or free-tier limits stay unenforced.'
  );

  const failing = checks.filter((c) => !c.ok);
  return NextResponse.json({
    ok: failing.length === 0,
    verdict: failing.length === 0
      ? 'Billing is configured. If checkout still fails, the reason is now in the response from /api/stripe/checkout.'
      : `${failing.length} problem${failing.length === 1 ? '' : 's'}: ${failing.map((c) => c.name).join(', ')}.`,
    checks,
  });
}
