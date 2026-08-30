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
]);

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
