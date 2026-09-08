// lib/lifecycle-store.ts
//
// The ledger of lifecycle emails: who has had which, and who has said stop.
//
// One row per (person, kind), and the primary key IS the idempotency. The
// rule every sender follows: INSERT the row first, send only if the insert
// succeeded, mark it sent after, and delete it if the provider refused. Two
// crons overlapping, a webhook retried by Stripe, a 402 hit three times in a
// row — all of them collide on the key and only one of them sends. Doing it
// the other way round (send, then record) is how a person gets the same
// email twice, and a second "welcome" is worse than none.
//
// The opt-out is a row too, under kind 'unsubscribed'. Same table, so a
// database that can send can record a refusal without a second migration.
//
// Some deployments have not run every migration (see the missingColumn
// fallback in app/api/conversations/route.ts). When this table is missing
// the answer is always "do not send": a ledger that cannot be written cannot
// promise once-ever, and once-ever is the promise. That is logged once, not
// per call, because a daily cron over two hundred people would otherwise say
// the same thing two hundred times.

import { supabaseAdmin } from './supabase';
import { UNSUBSCRIBED_KIND, type LifecycleKind } from './lifecycle';

const TABLE = 'lifecycle_emails';
const RPC = 'lifecycle_candidates';

type DbError = { message?: string; code?: string } | null;

/**
 * Whether the store is reachable at all. The same shapes lib/usage.ts looks
 * for, repeated here rather than shared because the two modules answer the
 * question differently — usage fails open, this fails closed — and a shared
 * helper would invite the wrong default in one of them.
 */
function unavailable(error: DbError): boolean {
  if (!error) return false;
  const m = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
  return (
    m.includes('does not exist') ||
    m.includes('could not find') ||
    m.includes('schema cache') ||
    m.includes('42p01') || // undefined_table
    m.includes('42883') // undefined_function
  );
}

function conflict(error: DbError): boolean {
  if (!error) return false;
  return error.code === '23505' || (error.message ?? '').toLowerCase().includes('duplicate key');
}

let warned = false;
function warnOnce(where: string, error: unknown): void {
  if (warned) return;
  warned = true;
  console.warn(`lifecycle store: unavailable (${where}) — no lifecycle email will be sent`, error);
}

export type ClaimResult = 'claimed' | 'already' | 'unavailable';

/**
 * Take the row for (person, kind). 'claimed' means this caller may send;
 * 'already' means someone has, or is about to; 'unavailable' means nothing
 * can be promised, so nothing goes.
 *
 * `dueAt` is for the deferred kinds: limit-chats is claimed at the refusal
 * and sent by the cron a day later, so the claim records when it falls due.
 */
export async function claimLifecycle(
  userId: string,
  kind: LifecycleKind,
  opts: { dueAt?: number | null; now?: number } = {}
): Promise<ClaimResult> {
  try {
    const { error } = await supabaseAdmin()
      .from(TABLE)
      .insert({
        user_id: userId,
        kind,
        created_at: opts.now ?? Date.now(),
        due_at: opts.dueAt ?? null,
        sent_at: null,
      });
    if (!error) return 'claimed';
    if (conflict(error)) return 'already';
    if (unavailable(error)) warnOnce('claim', error);
    else console.warn('lifecycle store: claim failed', error.code);
    return 'unavailable';
  } catch (e) {
    warnOnce('claim', e);
    return 'unavailable';
  }
}

/** The send landed. */
export async function markSent(userId: string, kind: LifecycleKind, at = Date.now()): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin()
      .from(TABLE)
      .update({ sent_at: at })
      .eq('user_id', userId)
      .eq('kind', kind);
    return !error;
  } catch {
    return false;
  }
}

/**
 * The send did not land: give the row back so a later attempt can claim it.
 * Only an UNSENT row is released — a claim that has been marked sent is a
 * fact, and deleting it would open the door to a second copy.
 */
export async function releaseClaim(userId: string, kind: LifecycleKind): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin()
      .from(TABLE)
      .delete()
      .eq('user_id', userId)
      .eq('kind', kind)
      .is('sent_at', null);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Has this person said stop? null when the store cannot say.
 */
export async function readUnsubscribed(userId: string): Promise<boolean | null> {
  try {
    const { data, error } = await supabaseAdmin()
      .from(TABLE)
      .select('kind')
      .eq('user_id', userId)
      .eq('kind', UNSUBSCRIBED_KIND)
      .maybeSingle();
    if (error) {
      if (unavailable(error)) warnOnce('read', error);
      return null;
    }
    return !!data;
  } catch (e) {
    warnOnce('read', e);
    return null;
  }
}

/**
 * The sender's question. A refusal that cannot be read is honoured, not
 * overridden: when the store is silent the answer is "yes, treat them as
 * unsubscribed", because sending to someone who may have said stop is the
 * failure, and not sending to someone who has not is only a delay.
 */
export async function isUnsubscribed(userId: string): Promise<boolean> {
  return (await readUnsubscribed(userId)) ?? true;
}

/** Record, or withdraw, the refusal. Returns whether it was written. */
export async function setUnsubscribed(userId: string, on: boolean): Promise<boolean> {
  try {
    const db = supabaseAdmin();
    if (on) {
      const { error } = await db.from(TABLE).insert({
        user_id: userId,
        kind: UNSUBSCRIBED_KIND,
        created_at: Date.now(),
        due_at: null,
        sent_at: null,
      });
      if (error && !conflict(error)) {
        if (unavailable(error)) warnOnce('set', error);
        return false;
      }
      return true;
    }
    const { error } = await db
      .from(TABLE)
      .delete()
      .eq('user_id', userId)
      .eq('kind', UNSUBSCRIBED_KIND);
    if (error) {
      if (unavailable(error)) warnOnce('set', error);
      return false;
    }
    return true;
  } catch (e) {
    warnOnce('set', e);
    return false;
  }
}

export interface DueRow {
  userId: string;
  /** when the row was claimed — for limit-chats, the refusal itself */
  createdAt: number;
  dueAt: number | null;
  sentAt: number | null;
}

/**
 * limit-chats rows whose day has come and that have not gone out. Oldest
 * first, so a backlog drains in the order it formed.
 */
export async function dueLimitChats(now: number, limit: number): Promise<DueRow[]> {
  try {
    const { data, error } = await supabaseAdmin()
      .from(TABLE)
      .select('user_id, created_at, due_at, sent_at')
      .eq('kind', 'limit-chats')
      .is('sent_at', null)
      .lte('due_at', now)
      .order('due_at', { ascending: true })
      .limit(limit);
    if (error) {
      if (unavailable(error)) warnOnce('due', error);
      return [];
    }
    return (data ?? []).map((r) => ({
      userId: String(r.user_id),
      createdAt: Number(r.created_at) || 0,
      dueAt: r.due_at == null ? null : Number(r.due_at),
      sentAt: r.sent_at == null ? null : Number(r.sent_at),
    }));
  } catch (e) {
    warnOnce('due', e);
    return [];
  }
}

export interface Candidate {
  userId: string;
  /** ms of their first conversation */
  firstAt: number;
  /** ms of their most recent change */
  lastAt: number;
}

/**
 * People whose first activity falls in [from, to), who have been quiet for
 * a day, and who have had neither this kind nor said stop. The grouping and
 * the anti-join happen in the database (supabase/schema.sql,
 * lifecycle_candidates) because doing it here would mean reading every
 * conversation row to find two hundred people.
 */
export async function candidates(
  kind: LifecycleKind,
  from: number,
  to: number,
  now: number,
  limit: number
): Promise<Candidate[]> {
  try {
    const { data, error } = await supabaseAdmin().rpc(RPC, {
      p_kind: kind,
      p_from: from,
      p_to: to,
      p_now: now,
      p_limit: limit,
    });
    if (error) {
      if (unavailable(error)) warnOnce('candidates', error);
      else console.warn('lifecycle store: candidates failed', error.code);
      return [];
    }
    const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
    return rows
      .map((r) => ({
        userId: String(r.user_id ?? ''),
        firstAt: Number(r.first_at) || 0,
        lastAt: Number(r.last_at) || 0,
      }))
      .filter((c) => c.userId);
  } catch (e) {
    warnOnce('candidates', e);
    return [];
  }
}

/**
 * The person's most recent Logos session, for the day-N link — so "your
 * maps are where you left them" opens the one they left. An id only; the
 * title never leaves the database for an email. Null when there is none or
 * the store cannot say, and the link falls back to the plain surface.
 */
export async function latestLogosSession(userId: string): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin()
      .from('conversations')
      .select('id')
      .eq('user_id', userId)
      .eq('kind', 'logos')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    const id = (data as { id?: unknown }).id;
    return typeof id === 'string' && id ? id : null;
  } catch {
    return null;
  }
}
