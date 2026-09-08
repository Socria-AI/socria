// lib/analytics.ts
//
// The one door product events go through.
//
// Socria already ships @vercel/analytics for page views. This adds custom
// events on top of it, behind a typed surface, for a single reason: an
// analytics call written inline at a call site eventually captures something
// it should not. Routing every event through one function means the rule
// about what may be sent is enforced in one readable place instead of relied
// upon at a dozen.
//
// THE RULE: properties describe the SHAPE of what happened — which trigger,
// which surface, which plan, how many. Never the content of anyone's
// thinking. No message text, no node labels, no map titles, no file names, no
// user id, no email. `scrub()` below is the last line of that defence and it
// drops anything it was not told to expect.
//
// Vercel Web Analytics ignores custom events unless the plan supports them,
// and `track` is a no-op in development. Both are fine: nothing here is on a
// path that must succeed, and every call is wrapped anyway.

import { track as vercelTrack } from '@vercel/analytics';

/** Events this product emits. Adding one is a deliberate act. */
export const EVENTS = [
  'one_prompt_shown',
  'one_prompt_dismissed',
  'one_prompt_clicked',
  'one_checkout_started',
  'one_prompt_suppressed',
  // The two that used to be missing. Everything above is a prompt being
  // shown or pressed; these are the payment landing and the subscription
  // ending, reported from the Stripe webhook (lib/analytics-server.ts) with
  // the trigger that led there carried through Stripe's metadata. Without
  // them the funnel stopped at "checkout opened" and every trigger looked
  // equally good.
  'one_subscribed',
  'one_cancelled',
  // A lifecycle email went out — its kind, never its recipient.
  'lifecycle_email_sent',
  // The moment a cancellation is scheduled through the billing portal — the
  // one moment a save is possible — with Stripe's fixed-enum reason.
  'one_cancel_scheduled',
  // Activation, shape only: which line of thinking this is for the person
  // (first, second, later), and whether the first map to take a shape came
  // from an opening, the Explore page, or their own words.
  'logos_session_started',
  'first_map_shaped',
] as const;
export type AnalyticsEvent = (typeof EVENTS)[number];

/**
 * Property values Vercel accepts. Objects and arrays are not in this list on
 * purpose — a nested value is how conversation content ends up in analytics
 * by accident.
 */
export type PropValue = string | number | boolean | null;

/**
 * The properties any event may carry. This is an allow-list, not a hint: a
 * key that is not here is dropped by scrub() rather than sent.
 */
export interface EventProps {
  /** which trigger raised this, e.g. 'explore-spent' */
  trigger?: string;
  /** 'entitlement' | 'proactive' */
  category?: string;
  /** how strongly this moment indicated intent */
  intent?: string;
  /** the surface it happened on, e.g. 'logos' */
  surface?: string;
  /** true when a hard free-tier counter is what stopped them */
  hard_limit?: boolean;
  /** the counter that ran out, when one did */
  counter?: string;
  /** 'free' | 'one' */
  plan?: string;
  /** why a prompt was NOT shown, for the suppressed event */
  suppressed?: string;
  /** how many proactive prompts this person has dismissed, all time */
  dismissals?: number;
  /** whether the person is signed in — not who they are */
  signed_in?: boolean;
  /** which lifecycle email, for the sent event — a kind, never an address */
  kind?: string;
  /** where a server event came from: 'webhook' | 'cron' | 'route' — or, on checkout, the email kind that led there */
  source?: string;
  /** which line of thinking this is for the person: '1' | '2' | '3+' */
  nth?: string;
  /** an opening id, 'explore', or 'none' — the door, never the words */
  opening?: string;
  /** days between first activity and paying, bucketed: 'd0' | 'd1-3' | 'd4-7' | 'd8-30' | '30+' | 'unknown' */
  tenure?: string;
  /** Stripe's cancellation_details.feedback enum, never the free-text comment */
  feedback?: string;
}

const ALLOWED_KEYS = new Set<keyof EventProps>([
  'trigger',
  'category',
  'intent',
  'surface',
  'hard_limit',
  'counter',
  'plan',
  'suppressed',
  'dismissals',
  'signed_in',
  'kind',
  'source',
  'nth',
  'opening',
  'tenure',
  'feedback',
]);

/**
 * Which line of thinking this is for the person, as a bucket. Shape only —
 * three values, so nobody can be picked out by their count.
 */
export function nthBucket(n: number): '1' | '2' | '3+' {
  if (!Number.isFinite(n) || n <= 1) return '1';
  return n === 2 ? '2' : '3+';
}

/**
 * How long someone had been thinking here before they paid, from days to a
 * word. Answers "do people pay on day one or after a month", which decides
 * where every other effort should go — and nothing finer than that.
 */
export function tenureBucket(days: number | null | undefined): string {
  if (days === null || days === undefined || !Number.isFinite(days)) return 'unknown';
  if (days <= 0) return 'd0';
  if (days <= 3) return 'd1-3';
  if (days <= 7) return 'd4-7';
  if (days <= 30) return 'd8-30';
  return '30+';
}

/**
 * Keep only allowed keys, only scalar values, and cap strings.
 *
 * The length cap is the part that matters. Every allowed key is meant to hold
 * a short enum-like token; if one ever receives something long, that is a bug
 * that is about to put someone's words into analytics, and truncating to 64
 * characters makes the damage bounded rather than complete.
 */
export function scrub(props: EventProps): Record<string, PropValue> {
  const out: Record<string, PropValue> = {};
  for (const [k, v] of Object.entries(props)) {
    if (!ALLOWED_KEYS.has(k as keyof EventProps)) continue;
    if (v === undefined || v === null) continue;
    if (typeof v === 'string') out[k] = v.slice(0, 64);
    else if (typeof v === 'number') out[k] = Number.isFinite(v) ? v : 0;
    else if (typeof v === 'boolean') out[k] = v;
  }
  return out;
}

/**
 * Record something that happened. Never throws, never blocks, never awaited.
 *
 * Analytics failing must not be able to break the thing it is measuring, so
 * every failure mode here — no provider, a blocked script, a bad property —
 * ends the same way: nothing happens and the product carries on.
 */
export function track(event: AnalyticsEvent, props: EventProps = {}): void {
  try {
    vercelTrack(event, scrub(props));
  } catch {
    // An ad blocker, a server context, or analytics simply not configured.
  }
}
