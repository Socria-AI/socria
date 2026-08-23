// lib/socria-one-grant.ts
//
// The account-based Socria One grant, stored on the Clerk user.
//
// Why Clerk and not our own table: an access-code redemption should follow
// the person the moment they redeem it, on every deployment where they can
// sign in AT ALL — including one whose Supabase has never been migrated (or
// doesn't exist). Clerk's private metadata needs no schema, no SQL, and no
// new environment variables; if login works, this works.
//
// privateMetadata, not public: the grant is entitlement state, read and
// written only by the server. It never reaches the browser except as the
// resolved plan.

import { clerkClient } from '@clerk/nextjs/server';

const GRANT_KEY = 'socriaOne';
const GRANT_VALUE = 'comp';

// resolvePlanForRequest runs on every gated request, and asking Clerk's API
// each time would put a network round-trip in front of every map extraction.
// A short in-memory cache per server instance keeps that honest: a fresh
// grant is visible instantly (the write primes it), a revocation within a
// minute.
const TTL = 60_000;
const cache = new Map<string, { v: boolean; at: number }>();

export async function hasAccountGrant(userId: string): Promise<boolean> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL) return hit.v;
  try {
    const user = await clerkClient().users.getUser(userId);
    const v = (user?.privateMetadata as Record<string, unknown> | null)?.[GRANT_KEY] === GRANT_VALUE;
    cache.set(userId, { v, at: Date.now() });
    return v;
  } catch {
    // Clerk unreachable: answer from the stale cache if we have one, and
    // never let entitlement checking take the request down.
    return hit?.v ?? false;
  }
}

export async function writeAccountGrant(userId: string): Promise<void> {
  await clerkClient().users.updateUserMetadata(userId, {
    privateMetadata: { [GRANT_KEY]: GRANT_VALUE },
  });
  cache.set(userId, { v: true, at: Date.now() });
}
