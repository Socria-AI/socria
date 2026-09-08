// lib/analytics-server.ts
//
// The same door as lib/analytics.ts, for code that runs without a browser.
//
// A subscription is the one event this product most wants to count, and it
// arrives on a Stripe webhook — no page, no `window`, no client script. The
// client-side `track` cannot be called there, and importing the server flavour
// into lib/analytics.ts would drag server-only code into every component that
// records a dismissal. So this is its own module: same event vocabulary, same
// allow-list, same rule that analytics must never be able to break the thing
// it measures.
//
// Everything that goes through here is a short token from a fixed set. There
// is no code path from a conversation to this function.

import { track as vercelTrack } from '@vercel/analytics/server';
import { scrub, type AnalyticsEvent, type EventProps } from './analytics';

/**
 * Record something that happened on the server. Never throws.
 *
 * `request` is optional context for Vercel's attribution; a webhook's request
 * is Stripe's, not a person's, and that is fine — the event still lands.
 */
export async function trackServer(
  event: AnalyticsEvent,
  props: EventProps = {},
  request?: { headers: Headers }
): Promise<void> {
  try {
    await vercelTrack(event, scrub(props), request ? { request } : undefined);
  } catch {
    // Not configured, or the endpoint is unreachable. The product carries on.
  }
}
