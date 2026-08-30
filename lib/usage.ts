// lib/usage.ts
//
// The counters behind the free tier's boundaries, read and written server-side.
//
// The thing this replaces is a number the browser sent us. The Research limit
// used to be enforced from `body.researchUsed`, which meant posting a zero
// bought unlimited Research. Everything metered now comes from here, so the
// client's opinion of its own usage is only ever used to draw the UI.
//
// FAILS OPEN, on purpose. If the table is missing — a deployment that has not
// run the migration — the boundary lifts rather than closing. A free user
// getting more than they should is a pricing question; a paying user locked
// out by an unrun migration is a broken product, and the second is worse.

import { supabaseAdmin } from './supabase';
import {
  COUNTER_SCOPE,
  isSpent,
  limitOf,
  type Counter,
} from './entitlements';
import type { Plan } from './socria-one';

/** The month a monthly counter belongs to, in UTC. */
export function monthKey(at = Date.now()): string {
  const d = new Date(at);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Where a counter lives. Monthly counters share a month; per-chat counters
 * are keyed to the conversation, and a conversation with no id gets a scope
 * of its own so an anonymous action cannot spend someone else's allowance.
 */
export function scopeFor(counter: Counter, chatId?: string | null, at = Date.now()): string {
  if (COUNTER_SCOPE[counter] === 'month') return monthKey(at);
  return `chat:${(chatId || 'unknown').slice(0, 60)}`;
}

/** Whether the store is reachable at all. Missing table → treat as absent. */
function unavailable(error: { message?: string; code?: string } | null): boolean {
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

/** How many times a counter has been spent in its scope. */
export async function readUsage(
  userId: string,
  counter: Counter,
  chatId?: string | null
): Promise<number> {
  try {
    const { data, error } = await supabaseAdmin()
      .from('logos_usage')
      .select('n')
      .eq('user_id', userId)
      .eq('scope', scopeFor(counter, chatId))
      .eq('counter', counter)
      .maybeSingle();
    if (error) {
      if (!unavailable(error)) console.error('usage read:', error.message);
      return 0;
    }
    return typeof data?.n === 'number' ? data.n : 0;
  } catch {
    return 0;
  }
}

/** Every counter for one conversation plus the month, in one round trip. */
export async function readAllUsage(
  userId: string,
  chatId?: string | null
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  try {
    const scopes = [monthKey()];
    if (chatId) scopes.push(`chat:${chatId.slice(0, 60)}`);
    const { data, error } = await supabaseAdmin()
      .from('logos_usage')
      .select('counter, n, scope')
      .eq('user_id', userId)
      .in('scope', scopes);
    if (error) {
      if (!unavailable(error)) console.error('usage read-all:', error.message);
      return out;
    }
    for (const row of data ?? []) {
      out[(row as { counter: string }).counter] = (row as { n: number }).n;
    }
  } catch {
    /* fall through to zeros */
  }
  return out;
}

/**
 * Spend one. Returns the new total, or null when the store is unreachable —
 * which callers treat as "let it through", never as "block".
 */
export async function bumpUsage(
  userId: string,
  counter: Counter,
  chatId?: string | null,
  by = 1
): Promise<number | null> {
  try {
    const { data, error } = await supabaseAdmin().rpc('bump_logos_usage', {
      p_user: userId,
      p_scope: scopeFor(counter, chatId),
      p_counter: counter,
      p_by: by,
      p_at: Date.now(),
    });
    if (error) {
      if (!unavailable(error)) console.error('usage bump:', error.message);
      return null;
    }
    return typeof data === 'number' ? data : null;
  } catch {
    return null;
  }
}

export interface Allowance {
  /** false when this action is past the plan's limit */
  ok: boolean;
  used: number;
  limit: number | null;
}

/**
 * May this person do this, once more?
 *
 * Signed-out callers are not metered here: they have no account to meter
 * against, and the open surfaces they can reach are already bounded by the
 * rate limiter. Metering by IP would punish shared networks for no gain.
 */
export async function checkAllowance(
  userId: string | null,
  plan: Plan,
  counter: Counter,
  chatId?: string | null
): Promise<Allowance> {
  const limit = limitOf(plan, counter);
  if (limit === null || !userId) return { ok: true, used: 0, limit };
  const used = await readUsage(userId, counter, chatId);
  return { ok: !isSpent(plan, counter, used), used, limit };
}

/**
 * Check and spend in one step, for the routes where doing the work IS the
 * spend. Returns the allowance as it stood BEFORE the increment, so a caller
 * that is refused can report the count that refused it.
 */
export async function spend(
  userId: string | null,
  plan: Plan,
  counter: Counter,
  chatId?: string | null
): Promise<Allowance> {
  const allowance = await checkAllowance(userId, plan, counter, chatId);
  if (allowance.ok && userId && allowance.limit !== null) {
    await bumpUsage(userId, counter, chatId);
  }
  return allowance;
}
