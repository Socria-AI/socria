// lib/stripe.ts
//
// The Stripe client, made once. Mirrors supabaseAdmin(): server-only, lazily
// constructed, and loud about a missing key rather than failing later inside a
// checkout call where the error would read as something else.

import Stripe from 'stripe';
import { isMissingResource } from './stripe-diagnosis';

let cached: Stripe | null = null;

export function stripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('Stripe env vars missing. Set STRIPE_SECRET_KEY.');
  }
  cached = new Stripe(key, { apiVersion: '2026-07-29.dahlia' });
  return cached;
}

export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_PRICE_SOCRIA_ONE;
}

/** The Socria One price (see SOCRIA_ONE in lib/socria-one.ts). Never taken from the client. */
export function onePriceId(): string {
  const id = process.env.STRIPE_PRICE_SOCRIA_ONE;
  if (!id) throw new Error('Set STRIPE_PRICE_SOCRIA_ONE to the Socria One price id.');
  return id;
}

/** Where Stripe sends people back to. */
export function siteUrl(req?: { headers: Headers }): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, '');
  const origin = req?.headers.get('origin');
  if (origin) return origin.replace(/\/$/, '');
  return 'http://localhost:3000';
}

/**
 * The customer id, if this key can actually use it.
 *
 * Never trust a stored `cus_…`. Ours is written by us, but it can outlive the
 * account it belongs to: test and live are separate worlds with separate
 * customers, so an id created while testing is invisible to a live key and
 * the reverse; and a customer deleted in the dashboard is gone while our row
 * still names it. Both produce the same "No such customer" when the id is
 * handed to Checkout — at which point the sale has already failed, over a
 * record that is only a shortcut.
 *
 * So it is checked before it is used, and a dead one is simply discarded so
 * the caller can make a fresh customer. Any OTHER failure — Stripe down, a
 * network blip — returns the id unchanged: the point is to catch an id that
 * is definitely wrong, not to refuse to proceed whenever we cannot confirm
 * one is right.
 */
export async function usableCustomer(id: string | null | undefined): Promise<string | null> {
  if (!id) return null;
  try {
    const c = await stripe().customers.retrieve(id);
    return (c as { deleted?: boolean }).deleted ? null : id;
  } catch (e) {
    if (isMissingResource(e)) {
      console.warn(`stripe: stored customer ${id} is not visible to this key — replacing it`);
      return null;
    }
    return id;
  }
}
