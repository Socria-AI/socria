// lib/stripe.ts
//
// The Stripe client, made once. Mirrors supabaseAdmin(): server-only, lazily
// constructed, and loud about a missing key rather than failing later inside a
// checkout call where the error would read as something else.

import Stripe from 'stripe';

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

/** The $15/month Socria One price. Never taken from the client. */
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
