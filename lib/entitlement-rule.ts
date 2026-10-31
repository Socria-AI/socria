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
 * Stripe statuses that mean "this person is on Socria One right now".
 *
 * 'comp' was here: ours, a complimentary grant from a redeemed code, with no
 * Stripe subscription behind it. Socria One is paid for or it is not held
 * (the freemium change of October 31, 2026), so a complimentary row no longer
 * entitles — see RETIRED_STATUSES. The rows themselves are kept.
 *
 * 'past_due' is here on purpose. A card that failed renewal is a billing
 * problem to resolve with them, not a reason to lock someone out of thinking
 * they are in the middle of.
 */
export const LIVE_STATUSES: readonly string[] = ['active', 'trialing', 'past_due'];

/** Statuses that once entitled and no longer do, whatever period they carry: complimentary grants. */
export const RETIRED_STATUSES: readonly string[] = ['comp'];

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
/**
 * Stripe statuses for a subscription nobody has paid for: the first payment
 * never went through ('incomplete', and 'incomplete_expired' once Stripe gives
 * up on it), every retry failed ('unpaid'), or it is paused. Stripe sets
 * current_period_end the moment a subscription exists, paid or not — so these
 * have a period "still running" that was never bought, and must not be read
 * as one. A cancellation is different: it keeps the period it paid for.
 */
export const UNPAID_STATUSES: readonly string[] = ['incomplete', 'incomplete_expired', 'unpaid', 'paused'];

export function entitledBy(
  status: unknown,
  periodEnd: number | null | undefined,
  // the moment to judge at: now, unless a caller is reading a snapshot taken at another time
  now: number = Date.now()
): boolean {
  if (typeof status === 'string' && LIVE_STATUSES.includes(status)) return true;
  if (typeof status === 'string' && (UNPAID_STATUSES.includes(status) || RETIRED_STATUSES.includes(status))) return false;
  return typeof periodEnd === 'number' && periodEnd * 1000 > now;
}
