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
// So is the newsletter (lib/newsletter.ts), twice over: its subscription is a
// row under kind 'newsletter' — present means asked for, absent means not —
// and each issue is claimed per person under 'newsletter:<issue>', by the
// same insert-first rule as every note. Still ids and timestamps only.
//
// Some deployments have not run every migration (see the missingColumn
// fallback in app/api/conversations/route.ts). When this table is missing
// the answer is always "do not send": a ledger that cannot be written cannot
// promise once-ever, and once-ever is the promise. That is logged once, not
// per call, because a daily cron over two hundred people would otherwise say
// the same thing two hundred times.

import { supabaseAdmin } from './supabase';
import { UNSUBSCRIBED_KIND, type LifecycleKind } from './lifecycle';
import { NEWSLETTER_KIND, type IssueKind } from './newsletter';

/** Everything a sender claims: a note, or one newsletter issue. */
export type LedgerKind = LifecycleKind | IssueKind;

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
  kind: LedgerKind,
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
export async function markSent(userId: string, kind: LedgerKind, at = Date.now()): Promise<boolean> {
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
export async function releaseClaim(userId: string, kind: LedgerKind): Promise<boolean> {
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
 * Whether the row for a standing preference — a refusal, a subscription — is
 * there. null when the store cannot say.
 */
async function readFlag(userId: string, kind: string): Promise<boolean | null> {
  try {
    const { data, error } = await supabaseAdmin()
      .from(TABLE)
      .select('kind')
      .eq('user_id', userId)
      .eq('kind', kind)
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

/** Write, or remove, a standing preference's row. Returns whether it was written. */
async function setFlag(userId: string, kind: string, on: boolean): Promise<boolean> {
  try {
    const db = supabaseAdmin();
    if (on) {
      const { error } = await db.from(TABLE).insert({
        user_id: userId,
        kind,
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
      .eq('kind', kind);
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

/**
 * Has this person said stop? null when the store cannot say.
 */
export async function readUnsubscribed(userId: string): Promise<boolean | null> {
  return readFlag(userId, UNSUBSCRIBED_KIND);
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
  return setFlag(userId, UNSUBSCRIBED_KIND, on);
}

/**
 * Has this person asked for the newsletter? null when the store cannot say —
 * and a sender treats that as "no", the mirror of isUnsubscribed: an issue
 * goes only to someone whose request can be read.
 */
export async function readNewsletter(userId: string): Promise<boolean | null> {
  return readFlag(userId, NEWSLETTER_KIND);
}

/** Subscribe (the sign-up box, the switch) or unsubscribe (the switch, any link). */
export async function setNewsletter(userId: string, on: boolean): Promise<boolean> {
  return setFlag(userId, NEWSLETTER_KIND, on);
}

/** PostgREST's ceiling on rows per request; pages are read at this size. */
const PAGE = 1000;
/** How many ids one listing will read before it stops and says so. */
const LIST_CAP = 50_000;

/**
 * Every person holding a row of this kind, by id: the newsletter's
 * subscribers ('newsletter'), or everyone an issue has been claimed for
 * ('newsletter:<issue>'). Read a page at a time, ordered by id. null when
 * the store cannot say — and a sender then sends to nobody, never to a list
 * it could not read whole. Ids only; the ledger holds nothing else.
 */
export async function idsWithKind(kind: string): Promise<{ ids: string[]; capped: boolean } | null> {
  const ids: string[] = [];
  try {
    let after: string | null = null;
    while (ids.length < LIST_CAP) {
      let q = supabaseAdmin().from(TABLE).select('user_id').eq('kind', kind);
      if (after) q = q.gt('user_id', after);
      const { data, error } = await q.order('user_id', { ascending: true }).limit(PAGE);
      if (error) {
        if (unavailable(error)) warnOnce('list', error);
        else console.warn('lifecycle store: list failed', error.code);
        return null;
      }
      const page = (data ?? []).map((r) => String(r.user_id)).filter(Boolean);
      ids.push(...page);
      if (page.length < PAGE) return { ids, capped: false };
      after = page[page.length - 1];
    }
    return { ids: ids.slice(0, LIST_CAP), capped: true };
  } catch (e) {
    warnOnce('list', e);
    return null;
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
  return dueRows('limit-chats', now, limit);
}

/** How long a claimed-but-unsent row waits before the cron picks it up. */
export const STRANDED_MS = 60 * 60 * 1000;

/**
 * Welcomes that were claimed and never sent.
 *
 * The webhook claims the row, then sends inside a short race so Stripe is not
 * kept waiting; if the instance is frozen before the provider answers, the
 * row is left claimed with nothing delivered, and every later attempt sees
 * 'already'. Nothing else would ever look at it — Stripe does not redeliver a
 * 200, and the subscription events do not send welcomes. So the daily run
 * sweeps rows claimed more than an hour ago and still unsent.
 */
export async function strandedWelcomes(now: number, limit: number): Promise<DueRow[]> {
  return dueRows('welcome-one', now - STRANDED_MS, limit, 'created_at');
}

async function dueRows(
  kind: LifecycleKind,
  before: number,
  limit: number,
  column: 'due_at' | 'created_at' = 'due_at'
): Promise<DueRow[]> {
  try {
    const { data, error } = await supabaseAdmin()
      .from(TABLE)
      .select('user_id, created_at, due_at, sent_at')
      .eq('kind', kind)
      .is('sent_at', null)
      .lte(column, before)
      .order(column, { ascending: true })
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
