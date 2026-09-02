// lib/subscriptions.ts
//
// Socria One entitlement, as the server knows it.
//
// Stripe is the source of truth; the `socria_subscriptions` table is a local
// projection of it, written only by the webhook. Nothing here trusts the
// browser — a request says what it believes it has and this decides.
//
// Two deliberate choices:
//
//   * A cancelled subscription stays entitled until `current_period_end`.
//     Someone who cancels on the 3rd has paid through the month; taking Logos
//     away that afternoon would be theft of something already bought.
//
//   * 'past_due' stays entitled. A card that failed renewal is a billing
//     problem to resolve with them, not a reason to lock someone out of
//     thinking they are in the middle of.

import { supabaseAdmin } from './supabase';
import { entitledBy } from './entitlement-rule';

export interface SubscriptionRow {
  userId: string;
  customerId: string;
  subscriptionId: string | null;
  status: string;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
}

/** The sentinel customer id a complimentary row carries. Never a real
 * Stripe customer; checkout and the billing portal must not treat it as one. */
export function isCompCustomer(customerId: string | null | undefined): boolean {
  return !!customerId && customerId.startsWith('comp_');
}

/**
 * Grant Socria One to an account from a redeemed access code. Overwrites
 * nothing that matters: a real subscription row would already entitle them,
 * and if they later subscribe for real, checkout replaces this row.
 */
export async function grantComplimentary(userId: string): Promise<void> {
  const existing = await getSubscription(userId);
  // Never downgrade a real Stripe relationship to a comp row.
  if (existing && !isCompCustomer(existing.customerId)) {
    if (entitles(existing)) return;
    // A dead real subscription: keep the customer, mark them comp'd.
    await upsertSubscription({
      userId,
      customerId: existing.customerId,
      subscriptionId: existing.subscriptionId,
      status: 'comp',
    });
    return;
  }
  await upsertSubscription({
    userId,
    customerId: `comp_${userId}`,
    status: 'comp',
  });
}

export function entitles(
  row: Pick<SubscriptionRow, 'status' | 'currentPeriodEnd'> | null | undefined
): boolean {
  if (!row) return false;
  return entitledBy(row.status, row.currentPeriodEnd);
}

export async function getSubscription(userId: string): Promise<SubscriptionRow | null> {
  try {
    const { data, error } = await supabaseAdmin()
      .from('socria_subscriptions')
      .select('user_id, stripe_customer_id, stripe_subscription_id, status, current_period_end, cancel_at_period_end')
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data) return null;
    return {
      userId: data.user_id,
      customerId: data.stripe_customer_id,
      subscriptionId: data.stripe_subscription_id ?? null,
      status: data.status ?? 'incomplete',
      currentPeriodEnd: data.current_period_end ?? null,
      cancelAtPeriodEnd: !!data.cancel_at_period_end,
    };
  } catch {
    // Supabase not configured (local dev, preview): nobody is subscribed, and
    // that is a clean answer rather than a crash on every Logos request.
    return null;
  }
}

/** Is this person on Socria One? The single question the routes ask. */
export async function isSubscribed(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  return entitles(await getSubscription(userId));
}

/**
 * The same write, for the places where failing must not stop the person.
 *
 * The distinction is not stylistic. Recording a customer before checkout is
 * BOOKKEEPING: useful, and no reason to refuse somebody's money if the store
 * is unreachable. Recording what they now hold, in the webhook, is the
 * PRODUCT: that one has to be retried until it lands.
 *
 * Returns whether it worked, so a caller that has a second place to put the
 * fact can go and use it.
 */
export async function tryUpsertSubscription(
  row: Parameters<typeof upsertSubscription>[0]
): Promise<boolean> {
  try {
    await upsertSubscription(row);
    return true;
  } catch {
    return false;
  }
}

export async function upsertSubscription(row: {
  userId: string;
  customerId: string;
  subscriptionId?: string | null;
  status: string;
  priceId?: string | null;
  currentPeriodEnd?: number | null;
  cancelAtPeriodEnd?: boolean;
}): Promise<void> {
  const { error } = await supabaseAdmin()
    .from('socria_subscriptions')
    .upsert(
      {
        user_id: row.userId,
        stripe_customer_id: row.customerId,
        stripe_subscription_id: row.subscriptionId ?? null,
        status: row.status,
        price_id: row.priceId ?? null,
        current_period_end: row.currentPeriodEnd ?? null,
        cancel_at_period_end: !!row.cancelAtPeriodEnd,
        updated_at: Date.now(),
      },
      { onConflict: 'user_id' }
    );
  if (error) {
    console.error('upsertSubscription error:', error);
    throw error;
  }
}

/** Find the user a Stripe customer belongs to, for webhook events. */
export async function userForCustomer(customerId: string): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin()
      .from('socria_subscriptions')
      .select('user_id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();
    return data?.user_id ?? null;
  } catch {
    return null;
  }
}
