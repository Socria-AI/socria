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
import { entitledBy } from './entitlement-rule';
import { readStudentMonth, studentStanding, type EmailLike, type StudentMonth } from './socria-edu';

const GRANT_KEY = 'socriaOne';
const GRANT_VALUE = 'comp';

/**
 * Where a student's free month is recorded: the address it began with and
 * when (lib/socria-edu.ts STUDENT_OFFER). A record of a START, not a grant —
 * whether it entitles anybody is decided on every read, from the date and the
 * addresses on the account, so it cannot outlive either.
 */
const STUDENT_KEY = 'socriaStudent';

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
const STRIPE_KEY = 'socriaOneStripe';

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

function readMirror(meta: Record<string, unknown> | null | undefined): StripeMirror | null {
  const raw = meta?.[STRIPE_KEY];
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  return {
    status: typeof m.status === 'string' ? m.status : '',
    periodEnd: typeof m.periodEnd === 'number' ? m.periodEnd : null,
  };
}

// Accounts that hold Socria One unconditionally — no code to type, no
// environment to configure, nothing to redeem. Checked against EVERY email
// on the Clerk user (people sign in with Google one day and email the
// next), case-insensitively. Server-side only; this list never reaches the
// client bundle. A match is also written through to the account's metadata
// grant, so the entitlement survives even this list changing later.
const COMPED_EMAILS = new Set(['tiffanylin096@gmail.com']);

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
    const granted = meta?.[GRANT_KEY] === GRANT_VALUE;
    // VERIFIED, not merely present. An address can be added to an account
    // before it is confirmed, so matching on the string alone would hand
    // Socria One to anyone willing to type a comped person's email into their
    // own settings. What cannot be faked is receiving the code sent to it.
    const comped = (user?.emailAddresses ?? []).some(
      (e) =>
        e?.verification?.status === 'verified' &&
        COMPED_EMAILS.has(e.emailAddress?.toLowerCase?.() ?? '')
    );
    // A student at an approved university, by verified address: their one
    // free month, begun the first time it is seen while the offer is open
    // (lib/socria-edu.ts STUDENT_OFFER). Inert where neither SOCRIA_EDU_DOMAINS
    // nor an open offer names a domain.
    const standing = studentStanding({
      emails: (user?.emailAddresses ?? []) as EmailLike[],
      recorded: readStudentMonth(meta?.[STUDENT_KEY]),
      now: Date.now(),
    });
    if (standing.begins && standing.month) void recordStudentMonth(userId, standing.month);
    const student = standing.active;
    // A paid subscription, as the webhook last saw it. Checked here so that
    // somebody who has actually paid is entitled even when the subscriptions
    // table cannot be read.
    const paid = mirrorEntitles(readMirror(meta));
    const v = granted || comped || paid || student;
    cache.set(userId, { v, at: Date.now() });
    // Make a list match permanent on the account itself.
    //
    // Deliberately NOT done for a student: what is written for them is when
    // their month BEGAN (recordStudentMonth), never a grant — a grant would
    // outlive the address it came from and the month it was for.
    if (comped && !granted) void writeAccountGrant(userId).catch(() => {});
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
