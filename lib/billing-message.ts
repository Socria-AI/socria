// lib/billing-message.ts
//
// What to say when billing refuses.
//
// Three surfaces open checkout — the /one page, the Socria One card on the
// account page, and the sheet inside Logos — and each had its own fallback
// string. That was fine while the server only ever answered "Could not start
// checkout.", and useless the moment the server learned to say why: a reason
// that reaches one surface and not the other two is a reason nobody sees.
//
// The route now returns `error` (what to tell the person), and, when it knows
// it, `code` and `detail` (what to tell whoever has to fix it). The detail is
// a configuration fact — a missing price, a test key on a live deployment —
// not an internal secret; see stripeFailure() for what is allowed through.

export interface BillingError {
  /** the sentence to show */
  message: string;
  /** the short machine code, when the server named one */
  code?: string;
  /** the operator-facing explanation, when there is one worth showing */
  detail?: string;
}

const FALLBACK = 'Checkout could not be reached just now.';

/** Read a failed billing response into something sayable. */
export function billingError(body: unknown, fallback = FALLBACK): BillingError {
  const j = (body ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string | undefined =>
    typeof v === 'string' && v.trim() ? v.trim().slice(0, 240) : undefined;
  return {
    message: str(j.error) ?? fallback,
    code: str(j.code),
    detail: str(j.detail),
  };
}

/**
 * The whole thing on one line, for surfaces with nowhere to put a second.
 *
 * The code is included even without a detail, because "could not start
 * checkout (resource_missing)" is something a person can search for and
 * "could not start checkout" is not.
 */
export function billingLine(e: BillingError): string {
  if (e.detail) return `${e.message} ${e.detail}`;
  return e.code ? `${e.message} (${e.code})` : e.message;
}
