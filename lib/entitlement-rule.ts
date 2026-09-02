// lib/entitlement-rule.ts
//
// Whether a subscription entitles its holder, right now.
//
// One function, no imports, because the answer is written down in two places
// and they must not be allowed to disagree. The subscriptions table
// (lib/subscriptions.ts) is the projection of Stripe we read on every
// request; the account mirror (lib/socria-one-grant.ts) is the copy that
// survives that table being unreachable. Both are records of the same fact,
// and a person whose entitlement depends on which one happened to be readable
// is a bug waiting for an outage.
//
// It used to be a `LIVE` set in each file with a comment in the second saying
// it must keep mirroring the first. A comment is not a guarantee; a shared
// function is.

/**
 * Stripe statuses that mean "this person is on Socria One right now" — plus
 * 'comp', ours: a complimentary grant from a redeemed access code, which has
 * no Stripe subscription behind it at all.
 *
 * 'past_due' is here on purpose. A card that failed renewal is a billing
 * problem to resolve with them, not a reason to lock someone out of thinking
 * they are in the middle of.
 */
export const LIVE_STATUSES: readonly string[] = [
  'active',
  'trialing',
  'past_due',
  'comp',
];

/**
 * The rule.
 *
 * `periodEnd` is Stripe's, in SECONDS. Reading it as milliseconds would put
 * every period end in 1970 and revoke everybody, which is why both callers
 * hand it over exactly as Stripe reports it and the conversion happens here,
 * once.
 *
 * A cancelled subscription stays entitled until the period it has paid for
 * runs out. Someone who cancels on the 3rd has paid through the month; taking
 * Logos away that afternoon would be theft of something already bought.
 */
export function entitledBy(
  status: unknown,
  periodEnd: number | null | undefined
): boolean {
  if (typeof status === 'string' && LIVE_STATUSES.includes(status)) return true;
  return typeof periodEnd === 'number' && periodEnd * 1000 > Date.now();
}
