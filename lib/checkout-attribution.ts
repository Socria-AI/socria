// lib/checkout-attribution.ts
//
// Which moment led to a subscription.
//
// The product records when Socria One is mentioned, when the mention is
// dismissed, and when checkout is opened — and then nothing. The one event
// that matters, the payment, comes back from Stripe on a webhook with no
// browser attached and no memory of what the person was doing when they
// pressed the button. So every trigger looked equally good, and the question
// "which of these actually converts" had no answer.
//
// The fix is to let the trigger travel: the client names it when it opens
// checkout, the checkout route writes it into the Stripe session's metadata,
// and the webhook reads it back when the payment lands. This file is the
// allow-list both ends validate against, so a value that reaches Stripe — or
// comes back from it, where anyone with dashboard access could have edited
// it — is one of a fixed set of short tokens and never free text.
//
// Nothing here is conversation content. A trigger is the NAME of a boundary
// or a moment ('explore-spent', 'map-grew'); a surface is which screen it was
// on. That is the entire vocabulary, and it is the point: attribution answers
// "what were they doing", never "what were they thinking about".

import { TRIGGERS, TRIGGER_REASONS, type TriggerReason } from './one-prompt';

/** Where checkout can be opened from. */
export const SURFACES = ['logos', 'core', 'one-page', 'account'] as const;
export type Surface = (typeof SURFACES)[number];

/**
 * What brought the person into the product before checkout, when it was a
 * link we sent: a lifecycle email's kind (arrives as `?via=<kind>`, stashed
 * by the client), or the Explore page. Last-touch attribution alone records
 * a day-3 email → return → map-full → subscribe as 'map-full'; this is the
 * first touch, and it is the same fixed vocabulary as everything else here.
 */
export const SOURCES = ['welcome-one', 'limit-chats', 'day-3', 'day-7', 'explore'] as const;
export type Source = (typeof SOURCES)[number];

export interface Attribution {
  trigger?: TriggerReason;
  surface?: Surface;
  source?: Source;
  /** implied by the trigger, never supplied */
  category?: 'entitlement' | 'proactive';
  intent?: 'low' | 'medium' | 'high' | 'urgent';
}

export function isSource(v: unknown): v is Source {
  return typeof v === 'string' && (SOURCES as readonly string[]).includes(v);
}

function isTrigger(v: unknown): v is TriggerReason {
  return typeof v === 'string' && (TRIGGER_REASONS as readonly string[]).includes(v);
}

function isSurface(v: unknown): v is Surface {
  return typeof v === 'string' && (SURFACES as readonly string[]).includes(v);
}

/**
 * What a checkout request may claim about itself.
 *
 * Category and intent are looked up from the trigger rather than read from
 * the body: they are properties of the moment, and a client that could
 * name its own intent could name it "urgent" for everything.
 */
export function readAttribution(body: unknown): Attribution {
  const b = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const out: Attribution = {};
  if (isTrigger(b.trigger)) {
    out.trigger = b.trigger;
    out.category = TRIGGERS[b.trigger].category;
    out.intent = TRIGGERS[b.trigger].intent;
  }
  if (isSurface(b.surface)) out.surface = b.surface;
  if (isSource(b.source)) out.source = b.source;
  return out;
}

/** The keys used in Stripe metadata, prefixed so they cannot collide. */
export const META_KEYS = {
  trigger: 'socria_trigger',
  surface: 'socria_surface',
  source: 'socria_source',
} as const;

/** Attribution as the flat string record Stripe metadata requires. */
export function attributionMetadata(a: Attribution): Record<string, string> {
  const out: Record<string, string> = {};
  if (a.trigger) out[META_KEYS.trigger] = a.trigger;
  if (a.surface) out[META_KEYS.surface] = a.surface;
  if (a.source) out[META_KEYS.source] = a.source;
  return out;
}

/**
 * Attribution read back from Stripe.
 *
 * Re-validated on the way in, not trusted on the way out: metadata is
 * editable in the dashboard, and the webhook feeds these values straight into
 * analytics properties.
 */
export function attributionFromMetadata(
  meta: Record<string, unknown> | null | undefined
): Attribution {
  if (!meta) return {};
  return readAttribution({
    trigger: meta[META_KEYS.trigger],
    surface: meta[META_KEYS.surface],
    source: meta[META_KEYS.source],
  });
}
