// lib/email-recipients.ts
//
// Where an email to a person may go, per user id, in batches of a hundred.
//
// Shared by every sender — the daily notes (app/api/cron/lifecycle) and the
// newsletter (app/api/email/newsletter) — so the rule below is applied in one
// place and a new sender cannot forget it.
//
// Not simply the primary address: a university address added for the student
// programme is on the account to prove eligibility and for nothing else, so
// `lifecycleAddress` skips past it, and answers null when every address we
// hold is one. A user Clerk does not return — deleted since, or the lookup
// failed — has no address either; the caller skips them and releases any
// ledger row it took, so nothing is recorded as sent that was not.

import { clerkClient } from '@clerk/nextjs/server';
import { lifecycleAddress } from './lifecycle';

/** Clerk's page size for getUserList by id. */
const CLERK_BATCH = 100;

export async function addressesFor(userIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < userIds.length; i += CLERK_BATCH) {
    const batch = userIds.slice(i, i + CLERK_BATCH);
    try {
      const { data } = await clerkClient().users.getUserList({ userId: batch, limit: CLERK_BATCH });
      for (const u of data) {
        const to = lifecycleAddress(
          u.emailAddresses.map((e) => ({
            address: e.emailAddress,
            primary: e.id === u.primaryEmailAddressId,
          }))
        );
        if (to) out.set(u.id, to);
      }
    } catch (e) {
      console.warn('email recipients: clerk lookup failed for a batch', e instanceof Error ? e.message : '');
    }
  }
  return out;
}
