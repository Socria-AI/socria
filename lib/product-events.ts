// lib/product-events.ts
//
// FIRST-PARTY COUNTS OF WHAT HAPPENED — anonymous, daily, shape only.
//
// Every product event already goes to Vercel Web Analytics (lib/analytics.ts).
// That is not enough to answer "which onboarding buttons do people press?":
// Vercel keeps custom events only on some plans, nothing in the product can
// read them back, and the onboarding's answers exist nowhere else — the role
// someone picks is deliberately kept in their browser, not on their account
// (lib/onboarding-roles.ts). So a small set of events is ALSO counted here, in
// Socria's own database, as one integer per (environment, day, event, kind).
//
// WHAT IS KEPT is a count. Not who, not when beyond the day, not a session,
// not a device: the row for "who:study on 2026-10-14" is a number and nothing
// else. The kinds are tokens from fixed vocabularies (a role id, a model id,
// 'skipped'), validated on the server (lib/product-event-kinds.ts), so a
// beacon cannot write free text into the table.
//
// Tiny on purpose: lib/analytics.ts imports this, and lib/analytics.ts is in
// every client bundle. The vocabularies live server-side.

/** Events counted first-party, beside Vercel. Adding one is a deliberate act. */
export const COUNTED_EVENTS = [
  // every answer on the onboarding screen: which step, which option or 'skipped'
  'onboarding_answered',
  // the first-run funnel, guests included (lib/first-run.ts)
  'socria_intro_started',
  'socria_intro_completed',
  'onboarding_skipped',
  'first_thought_submitted',
  'core_first_experience_completed',
  'core_aha_reached',
  'logos_first_experience_started',
  'logos_first_model_created',
  'logos_first_manipulation',
  'logos_first_experience_completed',
  // where an account came from, as the kinds lib/first-touch.ts already keeps
  'signup_completed',
] as const;
export type CountedEvent = (typeof COUNTED_EVENTS)[number];

const COUNTED = new Set<string>(COUNTED_EVENTS);

export function isCounted(event: string): event is CountedEvent {
  return COUNTED.has(event);
}

export const EVENTS_ENDPOINT = '/api/events';

/**
 * Send one counted event to the first-party counter. Fire-and-forget: a
 * beacon survives the page navigating away (most onboarding answers are the
 * last thing a page does), and nothing here can throw into the caller.
 */
export function countFirstParty(event: string, props: Record<string, unknown>): void {
  if (!COUNTED.has(event)) return;
  try {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
    const body = JSON.stringify({ e: event, p: props });
    if (typeof navigator.sendBeacon === 'function') {
      if (navigator.sendBeacon(EVENTS_ENDPOINT, new Blob([body], { type: 'application/json' }))) return;
    }
    void fetch(EVENTS_ENDPOINT, { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true }).catch(() => {});
  } catch {
    // A blocked beacon is a missed count, never a broken page.
  }
}
