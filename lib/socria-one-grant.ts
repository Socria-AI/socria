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

import { createHash } from 'node:crypto';
import { clerkClient } from '@clerk/nextjs/server';
import { entitledBy } from './entitlement-rule';
import { readStudentMonth, studentStanding, type EmailLike, type StudentMonth } from './socria-edu';

export const GRANT_KEY = 'socriaOne';
export const GRANT_VALUE = 'comp';

/**
 * Where a student's free month is recorded: the address it began with and
 * when (lib/socria-edu.ts STUDENT_OFFER). A record of a START, not a grant —
 * whether it entitles anybody is decided on every read, from the date and the
 * addresses on the account, so it cannot outlive either.
 */
export const STUDENT_KEY = 'socriaStudent';

/**
 * Where a PAID subscription is mirrored, beside the comp grant.
 *
 * The subscriptions table is the projection of Stripe we read on every
 * request, and it lives in a migration. If that migration has not been run —
 * or the database is simply unreachable — then someone can complete checkout,
 * be charged, and get nothing, because the only record of what they bought
 * failed to write. Taking money and delivering nothing is the worst failure
 * this codebase has available to it, so the fact is written in two places.
 *
 * Clerk is the right second place for the same reason the comp grant lives
 * here: it needs no schema and no new environment variable, and if login
 * works, this works. The webhook writes it on every lifecycle event, so a
 * cancellation revokes it exactly as it revokes the table row — this is a
 * mirror of the subscription's state, NOT a permanent grant.
 */
export const STRIPE_KEY = 'socriaOneStripe';

export interface StripeMirror {
  status: string;
  /** Stripe's period end, in SECONDS, as Stripe reports it */
  periodEnd: number | null;
}

/**
 * Does a mirrored subscription entitle its holder right now?
 *
 * The same rule the table uses, from the same function — see
 * lib/entitlement-rule.ts for why that matters.
 */
export function mirrorEntitles(m: StripeMirror | null | undefined): boolean {
  if (!m) return false;
  return entitledBy(m.status, m.periodEnd);
}

export function readMirror(meta: Record<string, unknown> | null | undefined): StripeMirror | null {
  const raw = meta?.[STRIPE_KEY];
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  return {
    status: typeof m.status === 'string' ? m.status : '',
    periodEnd: typeof m.periodEnd === 'number' ? m.periodEnd : null,
  };
}

// (A list of accounts that held Socria One unconditionally lived here, and was
// written through to the account as a permanent grant. Socria One is paid for
// or it is not held — the freemium change of October 31, 2026 — so it is gone,
// and a grant already written to an account's metadata is no longer read as
// one. Nothing is deleted: the metadata stays where it is.)

/**
 * THE OPERATOR'S PERMANENT GRANTS — accounts the owner has given Socria One for
 * good, by name. Not an offer and not a code: nobody can take one, and adding
 * one is a commit. Each is the SHA-256 of a VERIFIED email address, lowercased
 * and trimmed, so no address is ever written into the code; an account holds
 * the grant while that address is on it and verified (Clerk sends the code to
 * prove it), and loses it the moment the address goes.
 *
 * The complimentary list this replaces held addresses in the clear and was read
 * for anyone; this one is the owner's own short list, beside the environment's
 * user-id allowlist (SOCRIA_ONE_USER_IDS) for deployments that set one.
 */
export const OPERATOR_GRANTS: ReadonlySet<string> = new Set([
  // the owner's account (November 1, 2026)
  '195ff47bcd4609bfe6074d140da8d96943ee9ceba5b45adea341722a0784132c',
]);

/** The hash an address is listed under: SHA-256 of the address, lowercased and trimmed. */
export function grantHash(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

interface EmailLikeAddress {
  emailAddress?: string | null;
  verification?: { status?: string | null } | null;
}

/**
 * The grants in force: the list above, and any further hashes the deployment
 * sets in SOCRIA_ONE_GRANT_HASHES (comma-separated SHA-256 hex, the same
 * recipe) — so the owner can add someone without a commit, and still without
 * an address written anywhere.
 */
export function operatorGrants(env: string | undefined = process.env.SOCRIA_ONE_GRANT_HASHES): ReadonlySet<string> {
  const extra = (env ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter((h) => /^[0-9a-f]{64}$/.test(h));
  return extra.length ? new Set([...OPERATOR_GRANTS, ...extra]) : OPERATOR_GRANTS;
}

/** Whether any VERIFIED address on an account is one of the operator's permanent grants. */
export function operatorGranted(addresses: readonly EmailLikeAddress[] | null | undefined, grants: ReadonlySet<string> = operatorGrants()): boolean {
  return (addresses ?? []).some((e) => e?.verification?.status === 'verified' && typeof e.emailAddress === 'string' && grants.has(grantHash(e.emailAddress)));
}

// resolvePlanForRequest runs on every gated request, and asking Clerk's API
// each time would put a network round-trip in front of every map extraction.
// A short in-memory cache per server instance keeps that honest: a fresh
// grant is visible instantly (the write primes it), a revocation within a
// minute.
const TTL = 60_000;
const cache = new Map<string, { v: boolean; at: number }>();

export async function hasAccountGrant(userId: string): Promise<boolean> {
  return (await readGrant(userId)).v;
}

/**
 * The read behind hasAccountGrant, saying whether it really asked. `ok: false`
 * means Clerk could not be reached and `v` is a stale or default answer.
 */
async function readGrant(userId: string): Promise<{ v: boolean; ok: boolean }> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL) return { v: hit.v, ok: true };
  try {
    const user = await clerkClient().users.getUser(userId);
    const meta = user?.privateMetadata as Record<string, unknown> | null;
    // A paid subscription, as the webhook last saw it — checked here so that
    // somebody who has actually paid is entitled even when the subscriptions
    // table cannot be read. Beside it, only the operator's permanent grants
    // (OPERATOR_GRANTS): complimentary grants (GRANT_KEY), the old comped
    // addresses and student months no longer entitle anyone (October 31, 2026).
    const paid = mirrorEntitles(readMirror(meta));
    // …or the owner gave this account Socria One for good, by a verified address (OPERATOR_GRANTS)
    const v = paid || operatorGranted(user?.emailAddresses as EmailLikeAddress[] | undefined);
    cache.set(userId, { v, at: Date.now() });
    return { v, ok: true };
  } catch {
    // Clerk unreachable: answer from the stale cache if we have one, and
    // never let entitlement checking take the request down.
    return { v: hit?.v ?? false, ok: !!hit };
  }
}

/**
 * The same answer as hasAccountGrant, or null when Clerk could not be asked
 * and nothing is cached — for the one caller that must not mistake "unknown"
 * for "no" (Socria Rewards, deciding whether a reward is banked or started).
 */
export async function accountGrantKnown(userId: string): Promise<boolean | null> {
  const r = await readGrant(userId);
  return r.ok ? r.v : null;
}

export async function writeAccountGrant(userId: string): Promise<void> {
  await clerkClient().users.updateUserMetadata(userId, {
    privateMetadata: { [GRANT_KEY]: GRANT_VALUE },
  });
  cache.set(userId, { v: true, at: Date.now() });
}

/**
 * The mirrored subscription state, or null.
 *
 * Read by the surfaces that need to know whether a real Stripe relationship
 * stands behind an entitlement — a comp grant has nothing to manage, a paid
 * subscription has a portal to open.
 */
export async function readStripeMirror(userId: string): Promise<StripeMirror | null> {
  try {
    const user = await clerkClient().users.getUser(userId);
    return readMirror(user?.privateMetadata as Record<string, unknown> | null);
  } catch {
    return null;
  }
}

/**
 * Mirror a subscription's current state onto the account.
 *
 * Called by the webhook on every lifecycle event, so the mirror tracks the
 * subscription rather than outliving it. Never throws: this is the backup
 * path, and a backup that can take down the thing it is backing up is not one.
 */
export async function writeStripeMirror(
  userId: string,
  mirror: StripeMirror
): Promise<boolean> {
  try {
    await clerkClient().users.updateUserMetadata(userId, {
      privateMetadata: { [STRIPE_KEY]: mirror },
    });
    // Entitlement is the OR of three sources, so only a true may be primed:
    // priming false from this one would drop a comp holder whose card happens
    // to have lapsed. A false invalidates instead, and the next read asks all
    // three. Priming true still matters — for the person coming back from
    // checkout it is the difference between arriving to Socria One and
    // arriving to the free tier for another minute.
    if (mirrorEntitles(mirror)) cache.set(userId, { v: true, at: Date.now() });
    else cache.delete(userId);
    return true;
  } catch (e) {
    console.error('writeStripeMirror failed:', e);
    return false;
  }
}

/**
 * Record that a student's free month has begun — once per account; the read
 * that saw it begin is the only caller. Primes the grant, so the person who
 * has just verified arrives to Socria One rather than to the free tier for
 * another minute. Never throws: a record that could not be written means the
 * month begins again at the next read, which costs at most a few minutes.
 */
async function recordStudentMonth(userId: string, month: StudentMonth): Promise<boolean> {
  try {
    await clerkClient().users.updateUserMetadata(userId, {
      privateMetadata: { [STUDENT_KEY]: { email: month.email, since: month.since } },
    });
    cache.set(userId, { v: true, at: Date.now() });
    return true;
  } catch (e) {
    console.error('[socria] could not record a student month', e);
    return false;
  }
}

/** A student's standing, as the surfaces say it. */
export interface StudentStatus {
  /** the verified university address on the account, if any */
  email: string | null;
  /** their free month — running, or over — or none yet */
  month: { since: number; until: number; active: boolean } | null;
  /** a month began with this read */
  began: boolean;
}

/**
 * The verified university address and the free month behind a student's
 * access, for the surfaces that want to SAY which address qualified and until
 * when. Begins the month when this is the first read to see a qualifying
 * address — the plan route asks this before it resolves the plan, so verifying
 * and being told "until 9 November" happen in the same breath. Uncached,
 * because it is asked on a settings page rather than on every request.
 */
export async function studentStatus(userId: string): Promise<StudentStatus | null> {
  try {
    const user = await clerkClient().users.getUser(userId);
    const meta = user?.privateMetadata as Record<string, unknown> | null;
    const standing = studentStanding({
      emails: (user?.emailAddresses ?? []) as EmailLike[],
      recorded: readStudentMonth(meta?.[STUDENT_KEY]),
      now: Date.now(),
    });
    const began = standing.begins && !!standing.month && (await recordStudentMonth(userId, standing.month));
    return {
      email: standing.email,
      month: standing.month ? { since: standing.month.since, until: standing.month.until, active: standing.active } : null,
      began,
    };
  } catch {
    return null;
  }
}
