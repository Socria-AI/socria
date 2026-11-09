// lib/trial-server.ts — THE SEVEN-DAY TRIAL, KEPT ON THE SERVER (lib/trial.ts has the rules).
//
// Everything lives in the usage table the token holds already use (logos_usage), so the trial needs
// no migration and inherits its locks:
//
//   (user, 'trial', 'start')          when the trial began, in whole minutes. Written ONCE, atomically:
//                                     INSERT … ON CONFLICT DO NOTHING (lib/usage-rows.ts createOnce), so
//                                     two first requests at once cannot both begin a trial, and nothing
//                                     can move a start that is set. No SQL function is needed for it.
//   (user, 'tday:YYYY-MM-DD', 'tokens')  a day's settled tokens, held and settled by the token holds
//                                     (lib/token-allowance.ts) exactly as Sleep Mode's week was.
//   ('trialclaim:<hmac>', 'claim', 'trial')  a verified address that has had a trial — a keyed hash,
//                                     never the address. Keyed by the hash, not the account, so deleting
//                                     the account (which deletes the account's rows) leaves it.
//   (user, 'tday:…' | 'trial', 'hit' | 'ended' | 'upgraded')  markers that make an analytics event
//                                     count once per person (and per day, for a limit reached).
//   ('metrics:trial', 'mday:YYYY-MM-DD', <event>)  the day's counts for the dashboard: no person in them.
//
// The account's own rows are deleted with it and included in its export (app/api/account), as every
// logos_usage row keyed to it already is.
//
// NONE OF THIS NEEDS THE USAGE FUNCTIONS (supabase/freemium.sql). Where they answer they are used; where
// they are missing or answer an error, the same writes are made on the table alone (lib/usage-rows.ts),
// as strict. Production answered every trial's first message with "Your trial can't be checked right
// now" on November 9, 2026 because the start was written only through consume_logos_usage.

import { createHash, createHmac } from 'node:crypto';
import { clerkClient } from '@clerk/nextjs/server';
import { supabaseAdmin } from './supabase';
import { addTo, createOnce, readCount } from './usage-rows';
import {
  CLAIM_COUNTER,
  CLAIM_PREFIX,
  CLAIM_SCOPE,
  DAY_COUNTER,
  ENDED_COUNTER,
  HIT_COUNTER,
  START_COUNTER,
  START_SCOPE,
  dayKey,
  normaliseEmail,
  startFromStored,
  startToStored,
  trialLimits,
  trialState,
  type TrialState,
} from './trial';

class TrialStoreFault extends Error {}
const fault = (what: string, e: { message?: string } | null | undefined) => new TrialStoreFault(`trial ${what}: ${String(e?.message ?? 'no answer').slice(0, 160)}`);

/** The account's trial rows: when it began, and every day's tokens. Throws when the store cannot answer. */
async function readRows(userId: string): Promise<{ startedAt: number | null; byDay: Record<string, number> }> {
  const { data, error } = await supabaseAdmin().from('logos_usage').select('scope, counter, n').eq('user_id', userId).in('counter', [START_COUNTER, DAY_COUNTER]);
  if (error) throw fault('read', error);
  let startedAt: number | null = null;
  const byDay: Record<string, number> = {};
  for (const r of (data ?? []) as { scope: string; counter: string; n: number }[]) {
    if (r.scope === START_SCOPE && r.counter === START_COUNTER) startedAt = startFromStored(r.n);
    else if (r.counter === DAY_COUNTER && typeof r.scope === 'string' && r.scope.startsWith('tday:')) byDay[r.scope] = typeof r.n === 'number' ? r.n : 0;
  }
  return { startedAt, byDay };
}

// ── one trial a person ──────────────────────────────────────────────

/** The key for the address hashes: SOCRIA_TRIAL_SECRET, else derived from the server's Clerk secret. Null: no check. */
function claimKey(): Buffer | null {
  const secret = (process.env.SOCRIA_TRIAL_SECRET || process.env.CLERK_SECRET_KEY || '').trim();
  return secret ? createHash('sha256').update(`socria.trial.claim.v1|${secret}`, 'utf8').digest() : null;
}

/** The kept form of one address: an HMAC of it normalised. */
export function claimHash(email: string, key: Buffer): string | null {
  const norm = normaliseEmail(email);
  return norm ? createHmac('sha256', key).update(norm, 'utf8').digest('hex') : null;
}

const claimCache = new Map<string, { hashes: string[]; at: number }>();
/** The hashes of the account's VERIFIED addresses (an unverified address proves nothing). Empty when none can be read. */
async function verifiedHashes(userId: string): Promise<string[]> {
  const key = claimKey();
  if (!key) return [];
  const hit = claimCache.get(userId);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.hashes;
  try {
    const user = await clerkClient().users.getUser(userId);
    const hashes = (user?.emailAddresses ?? [])
      .filter((e) => e?.verification?.status === 'verified' && typeof e.emailAddress === 'string')
      .map((e) => claimHash(e.emailAddress, key))
      .filter((h): h is string => !!h);
    claimCache.set(userId, { hashes, at: Date.now() });
    if (claimCache.size > 5000) claimCache.delete(claimCache.keys().next().value as string);
    return hashes;
  } catch {
    // Clerk unreachable: no check this time (a trial is not refused because a lookup failed)
    return [];
  }
}

const claimSaid = new Set<string>();
/**
 * Has any of this account's verified addresses had a trial on another account? One read per address
 * (an account has one or two). A read that fails is said once in the log and taken as no: a guard
 * against a second trial is never a reason to refuse somebody their first.
 */
async function addressClaimed(userId: string): Promise<boolean> {
  const hashes = await verifiedHashes(userId);
  for (const h of hashes) {
    try {
      const n = await readCount({ user: CLAIM_PREFIX + h, scope: CLAIM_SCOPE, counter: CLAIM_COUNTER });
      if (n !== null && n > 0) return true;
    } catch (e) {
      if (!claimSaid.has('read')) {
        claimSaid.add('read');
        console.error('[trial] an address could not be checked for an earlier trial; not refusing for it:', e instanceof Error ? e.message : 'error');
      }
      return false;
    }
  }
  return false;
}

/** Add to a count through bump_logos_usage, or on the table alone where the function does not answer. Never throws. */
async function bumpSafely(user: string, scope: string, counter: string, at: number): Promise<void> {
  try {
    const { error } = await supabaseAdmin().rpc('bump_logos_usage', { p_user: user, p_scope: scope, p_counter: counter, p_by: 1, p_at: at });
    if (error) await addTo({ user, scope, counter }, 1, at);
  } catch {
    /* best effort: a lost count is a lost count */
  }
}

/** Take a marker once (n 0 → 1): true for the call that took it. consume_logos_usage, or the table alone. Never throws. */
async function markOnce(user: string, scope: string, counter: string, at: number): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin().rpc('consume_logos_usage', { p_user: user, p_scope: scope, p_counter: counter, p_by: 1, p_limit: 1, p_at: at });
    if (!error && typeof data === 'number') return data === 1;
    return (await addTo({ user, scope, counter }, 1, at, { limit: 1 })) === 1;
  } catch {
    return false;
  }
}

/** Keep the account's addresses as having had a trial. Best effort: a failure here never costs the person their trial. */
async function keepClaims(userId: string, at: number): Promise<void> {
  for (const h of await verifiedHashes(userId)) await bumpSafely(CLAIM_PREFIX + h, CLAIM_SCOPE, CLAIM_COUNTER, at);
}

// ── the state, and beginning ────────────────────────────────────────

/**
 * The account's trial now. `checkClaim`: for a trial not yet begun, also ask whether its address has
 * had one (a Clerk read, cached) — the gate and the usage panel do; upkeep does not. Throws when the
 * store cannot answer.
 */
export async function trialFor(userId: string, now = Date.now(), opts: { checkClaim?: boolean } = {}): Promise<TrialState> {
  const rows = await readRows(userId);
  const claimed = rows.startedAt === null && opts.checkClaim ? await addressClaimed(userId) : false;
  return trialState({ startedAt: rows.startedAt, now, byDay: rows.byDay, claimed, limits: trialLimits(process.env) });
}

/**
 * Begin the trial, if it has not begun: called with the account's first real model call. Returns when
 * it began. Atomic: of two first calls at once, one writes the start and the other reads it.
 */
export async function beginTrial(userId: string, now = Date.now()): Promise<number> {
  const m = startToStored(now);
  const row = { user: userId, scope: START_SCOPE, counter: START_COUNTER };
  let first: boolean;
  try {
    // the row created only if it is not there: of two first calls at once, exactly one is told it began it
    first = await createOnce(row, m, now);
  } catch (e) {
    // a table that will not take the row that way: the counter function, as before
    const { data, error } = await supabaseAdmin().rpc('consume_logos_usage', { p_user: userId, p_scope: START_SCOPE, p_counter: START_COUNTER, p_by: m, p_limit: m, p_at: now });
    if (error) throw fault('begin', { message: `${e instanceof Error ? e.message : 'create failed'}; ${String(error.message ?? 'error')}` });
    first = typeof data === 'number' && data === m;
  }
  if (!first) {
    const { startedAt } = await readRows(userId);
    if (startedAt !== null) return startedAt;
    // a start row with nothing usable in it (an attempt that died between creating and filling it):
    // filled now, only where it is still empty, so a start another request just set is never moved
    const cur = (await readCount(row)) ?? 0;
    first = cur <= 0 && (await addTo(row, m - cur, now, { limit: m })) === m;
    if (!first) {
      const again = await readRows(userId);
      if (again.startedAt === null) throw fault('begin', { message: 'start not recorded' });
      return again.startedAt;
    }
  }
  // this call began it: keep the address, and count the activation
  void keepClaims(userId, now);
  void countEvent('activated', now);
  return m * 60_000;
}

// ── analytics: counts with no person in them ────────────────────────

export const METRICS_USER = 'metrics:trial';
export const METRIC_EVENTS = ['activated', 'limit_hits', 'ended', 'upgrades', 'upgrades_in_trial', 'upgrades_after_trial', 'upgrades_no_trial'] as const;
export type MetricEvent = (typeof METRIC_EVENTS)[number];
export const metricDay = (now: number) => `mday:${dayKey(now).slice(5)}`;

/** Add one to the day's count of an event. Best effort, never throws. */
export async function countEvent(event: MetricEvent, now = Date.now()): Promise<void> {
  // a lost count is a lost count; the person's request is not held up for it
  await bumpSafely(METRICS_USER, metricDay(now), event, now);
}

/** Count an event once per person (and scope): a marker row is taken first, atomically. */
async function countOnce(userId: string, scope: string, counter: string, event: MetricEvent, now: number): Promise<void> {
  if (await markOnce(userId, scope, counter, now)) await countEvent(event, now);
}

/** A day's limit reached: counted once per person per day. */
export const countLimitHit = (userId: string, now = Date.now()) => countOnce(userId, dayKey(now), HIT_COUNTER, 'limit_hits', now);
/** The trial over (first refusal after it): counted once per person. */
export const countEnded = (userId: string, now = Date.now()) => countOnce(userId, START_SCOPE, ENDED_COUNTER, 'ended', now);

/**
 * Socria One begun (the Stripe webhook): counted once per person, with where they were — in the trial,
 * after it, or never having had one. Never throws.
 */
export async function countUpgrade(userId: string, now = Date.now()): Promise<void> {
  try {
    if (!(await markOnce(userId, START_SCOPE, 'upgraded', now))) return;
    const t = await trialFor(userId, now).catch(() => null);
    await countEvent('upgrades', now);
    await countEvent(!t || t.status === 'eligible' ? 'upgrades_no_trial' : t.status === 'active' ? 'upgrades_in_trial' : 'upgrades_after_trial', now);
  } catch {
    /* best effort */
  }
}
