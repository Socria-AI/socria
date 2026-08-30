// app/api/account/delete/route.ts
// DELETE → erase the account and everything attached to it.
//
// Erasure is a right under the GDPR (art. 17) and the CCPA, and it has to be
// real: every row keyed to this user, in every table, then the account itself.
//
// Order matters. Our own data goes FIRST and the identity last, because a
// failure after the Clerk user is gone would strand rows whose owner can no
// longer sign in to ask again. If a table fails we stop and say so rather than
// report a success that did not happen.

import { NextRequest, NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getSubscription, isCompCustomer } from '@/lib/subscriptions';
import { stripe, stripeConfigured } from '@/lib/stripe';
import { enforceRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Every table that keys rows to a user. Keep this list exhaustive. */
const OWNED_TABLES = [
  'conversations',
  'user_profiles',
  'logos_connections',
  'socria_subscriptions',
] as const;

export async function DELETE(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  // Deleting an account is irreversible, so it takes a deliberate confirmation
  // rather than a bare request that a stray click could produce.
  const body = await req.json().catch(() => ({}));
  if (body?.confirm !== 'DELETE') {
    return NextResponse.json(
      { error: 'Confirmation required.' },
      { status: 400 }
    );
  }

  const db = supabaseAdmin();
  const deleted: string[] = [];

  // Cancel billing BEFORE deleting anything. Stripe is the record of what
  // someone pays; dropping our projection without telling Stripe would leave a
  // live subscription charging an account that no longer exists — the worst
  // possible outcome of asking to be forgotten.
  let billingNote: string | null = null;
  try {
    const sub = await getSubscription(userId);
    if (sub?.subscriptionId && !isCompCustomer(sub.customerId) && stripeConfigured()) {
      await stripe().subscriptions.cancel(sub.subscriptionId);
      billingNote = 'Your Socria One subscription was cancelled.';
    }
  } catch (e) {
    console.error('account delete: could not cancel subscription', e);
    return NextResponse.json(
      {
        error:
          'We could not cancel your subscription, so nothing was deleted — otherwise you could keep being charged for an account that no longer exists. Please cancel in the billing portal first, or email hellosocria@gmail.com.',
      },
      { status: 500 }
    );
  }

  for (const table of OWNED_TABLES) {
    const { error } = await db.from(table).delete().eq('user_id', userId);
    if (error) {
      console.error(`account delete: ${table} failed`, error);
      return NextResponse.json(
        {
          error:
            'Could not delete everything, so nothing further was removed and your account still exists. Please email hellosocria@gmail.com and we will finish it by hand.',
          failedAt: table,
          deleted,
        },
        { status: 500 }
      );
    }
    deleted.push(table);
  }

  // The identity last.
  try {
    await clerkClient.users.deleteUser(userId);
  } catch (e) {
    console.error('account delete: clerk failed', e);
    return NextResponse.json(
      {
        error:
          'Your data was deleted, but the sign-in account could not be removed. Please email hellosocria@gmail.com so we can finish it.',
        deleted,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, deleted, billingNote });
}
