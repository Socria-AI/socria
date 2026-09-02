// lib/stripe-diagnosis.ts
//
// Reading a billing failure, and catching the two setup mistakes that look
// like one.
//
// Pure, and in its own file for the same reason lib/entitlement-rule.ts is:
// these are the parts worth holding a test around, and lib/stripe.ts imports
// the Stripe SDK, which cannot be bundled into a test run without dragging
// several megabytes of client along with it.

/**
 * What actually went wrong, in a form that is safe to send to the browser.
 *
 * "Could not start checkout." told nobody anything — not the person, and not
 * whoever had to work out why. Every failure in that route reported the same
 * eleven words, so diagnosing it meant guessing at the code and reading
 * server logs that the person seeing the error cannot reach.
 *
 * Stripe's own errors are the useful ones here and they are not secrets. A
 * price id, a mode mismatch, "no such price" — these are facts about a
 * misconfiguration, of the same kind Stripe prints in its own dashboard, and
 * the id of a price is public enough to appear in client-side integrations.
 * What must never go out is a key, so anything key-shaped is removed on the
 * way past regardless of where it came from.
 */
export function stripeFailure(e: unknown): { code: string; detail: string | null } {
  const err = e as { type?: string; code?: string; message?: string; raw?: { message?: string } };
  const type = typeof err?.type === 'string' ? err.type : '';
  const code = typeof err?.code === 'string' ? err.code : '';

  // Only Stripe's "you asked for something impossible" class carries a
  // message worth showing — the rest are network and server conditions whose
  // text says nothing a person can act on.
  const speakable =
    type === 'StripeInvalidRequestError' ||
    type === 'StripeAuthenticationError' ||
    type === 'StripePermissionError';

  const raw = err?.raw?.message ?? err?.message ?? '';
  const detail = speakable && raw ? redactKeys(String(raw)).slice(0, 200) : null;

  return { code: code || type || 'unknown', detail };
}

/** Nothing key-shaped leaves this process, whatever produced the string. */
function redactKeys(s: string): string {
  return s.replace(/\b(sk|rk|whsec|pk)_[A-Za-z0-9_]+/g, '$1_***');
}

/**
 * Config mistakes worth naming before Stripe is even called.
 *
 * Both of these produce a "No such price" from Stripe that reads as though
 * the price has been deleted, and both are things somebody does once while
 * setting up and then cannot see.
 */
export function priceIdProblem(): string | null {
  const id = process.env.STRIPE_PRICE_SOCRIA_ONE ?? '';
  if (!id) return 'STRIPE_PRICE_SOCRIA_ONE is not set.';
  if (id.startsWith('prod_')) {
    return 'STRIPE_PRICE_SOCRIA_ONE is a product id (prod_…). Checkout needs the PRICE id (price_…) from inside that product.';
  }
  if (!id.startsWith('price_')) {
    return `STRIPE_PRICE_SOCRIA_ONE does not look like a price id (expected price_…, got ${id.slice(0, 8)}…).`;
  }
  // Live keys cannot see test prices and the reverse; the ids do not say
  // which mode they belong to, but the KEY does, and a mismatch is the single
  // most common reason a checkout that worked in testing fails in production.
  const key = process.env.STRIPE_SECRET_KEY ?? '';
  if (key.startsWith('sk_test_') && process.env.VERCEL_ENV === 'production') {
    return 'STRIPE_SECRET_KEY is a TEST key on the production deployment. A test key cannot open a live price.';
  }
  return null;
}
