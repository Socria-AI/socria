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

export interface SubscriptionRow {
  userId: string;
  customerId: string;
  subscriptionId: string | null;
  status: string;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
}

/** Stripe statuses that mean "this person is on Socria One right now". */
const LIVE = new Set(['active', 'trialing', 'past_due']);

export function entitles(row: Pick<SubscriptionRow, 'status' | 'currentPeriodEnd'> | null): boolean {
  if (!row) return false;
  if (LIVE.has(row.status)) return true;
  // Cancelled or otherwise finished, but the paid period hasn't run out yet.
  if (row.currentPeriodEnd && row.currentPeriodEnd * 1000 > Date.now()) return true;
  return false;
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
