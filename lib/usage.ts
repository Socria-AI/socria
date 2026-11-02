// lib/usage.ts
//
// The counters behind the product's boundaries, read and written server-side.
//
// Two different things live here now. The plan boundaries — the free tier's
// conversations a month (lib/entitlements.ts says how many), effectively
// uncounted on Socria One. Everything else is a fair-use ceiling identical on both plans, set
// where serious work does not reach it, and lib/entitlements.ts says which is
// which (TIERED_COUNTERS). Nothing in this file needs to know the difference;
// the copy and the prompts do.
//
// The thing this replaces is a number the browser sent us. The Research limit
// used to be enforced from `body.researchUsed`, which meant posting a zero
// bought unlimited Research. Everything metered now comes from here, so the
// client's opinion of its own usage is only ever used to draw the UI.
//
// WHEN THE STORE CANNOT BE READ. A momentary read error lets the action through
// — an outage never blocks anyone mid-thought. A MISSING TABLE is different: it
// is a deployment that has not run supabase/freemium.sql, and it used to lift
// every free limit silently, for good (that is how free accounts drew a third
// and fourth map, November 2026). Now the free plan's monthly allowances —
// conversations, Logic Maps, nodes, artifacts, documents — are paused while the
// table is missing, with a sentence that says so (lib/quota.ts
// QUOTA_UNAVAILABLE), and the log says why. Socria One is never paused by it,
// and the fair-use ceilings both plans share still lift, as before.

import { supabaseAdmin } from './supabase';
import {
  COUNTER_SCOPE,
  isSpent,
  limitOf,
  TIERED_COUNTERS,
  type Counter,
} from './entitlements';
import { chatMarkerScope, chatScopeFor, dayKey, foldUsageRows, type UsageRow } from './usage-scope';

export { chatMarkerScope, chatScopeFor, dayKey, foldUsageRows, type UsageRow };
import type { Plan } from './socria-one';

/** The month a monthly counter belongs to, in UTC. */
export function monthKey(at = Date.now()): string {
  const d = new Date(at);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Where a counter lives. Monthly counters share a month, daily counters a day;
 * per-chat counters are keyed to the conversation, and a conversation with no
 * id gets a scope of its own so an anonymous action cannot spend someone
 * else's allowance.
 */
export function scopeFor(counter: Counter, chatId?: string | null, at = Date.now()): string {
  if (COUNTER_SCOPE[counter] === 'month') return monthKey(at);
  if (COUNTER_SCOPE[counter] === 'day') return dayKey(at);
  return chatScopeFor(chatId || 'unknown');
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

/**
 * Whether the usage table itself is missing — a deployment that has not run
 * supabase/freemium.sql. Asked once a minute per instance, not per request.
 * A table that answers with any other error is not "missing": that is a
 * momentary fault, and the caller lets the action through.
 */
// once a minute by default; USAGE_STORE_MEMO_MS=0 asks every time (the suite changes the store under it)
const storeMemoMs = () => {
  const v = Number(process.env.USAGE_STORE_MEMO_MS);
  return Number.isFinite(v) && v >= 0 ? v : 60_000;
};
let storeMemo: { missing: boolean; at: number } | null = null;
let saidMissing = false;
export async function usageStoreMissing(now = Date.now()): Promise<boolean> {
  if (storeMemo && now - storeMemo.at < storeMemoMs()) return storeMemo.missing;
  let missing = false;
  try {
    const { error } = await supabaseAdmin().from('logos_usage').select('n').limit(1);
    if (error) {
      const m = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
      missing = m.includes('42p01') || m.includes('pgrst205') || ((m.includes('relation') || m.includes('table')) && (m.includes('does not exist') || m.includes('could not find')));
    }
  } catch {
    missing = false;
  }
  storeMemo = { missing, at: now };
  if (missing && !saidMissing) {
    saidMissing = true;
    console.error('[usage] logos_usage is missing — the free plan is paused until supabase/freemium.sql is run (docs/FREEMIUM.md)');
  }
  return missing;
}

/** For the suite: forget the memo, so a test can change the store under it. */
export function forgetUsageStore(): void {
  storeMemo = null;
}

/** Whether a free-plan allowance is held closed because its store is missing. */
export async function pausedForMissingStore(plan: Plan, counter: Counter): Promise<boolean> {
  if (plan !== 'free' || !TIERED_COUNTERS.includes(counter)) return false;
  return usageStoreMissing();
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

/** Every counter for one conversation plus the month and the day, in one round trip. */
export async function readAllUsage(
  userId: string,
  chatId?: string | null
): Promise<Record<string, number>> {
  try {
    const now = Date.now();
    const month = monthKey(now);
    const day = dayKey(now);
    const chatScope = chatId ? chatScopeFor(chatId) : null;
    const scopes = [month, day];
    if (chatScope) scopes.push(chatScope);
    const { data, error } = await supabaseAdmin()
      .from('logos_usage')
      .select('counter, n, scope')
      .eq('user_id', userId)
      .in('scope', scopes);
    if (error) {
      if (!unavailable(error)) console.error('usage read-all:', error.message);
      return {};
    }
    return foldUsageRows(data as UsageRow[] | null, month, chatScope, day);
  } catch {
    return {};
  }
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

/**
 * Has this particular line of thinking already been counted?
 *
 * THE BUG THIS EXISTS FOR. `chats` is a MONTHLY counter, so scopeFor()
 * collapses it to the month and throws the conversation id away — which means
 * the count had no memory of WHICH session it had charged for. The route only
 * ever asked "is this a first user turn?", and that is a property of the
 * REQUEST, not of the conversation. So a first message that failed — a dropped
 * connection, a model error, a refresh, an impatient second press — charged
 * again on the retry. Two sends of one conversation could spend both of a free
 * month's lines of thinking, and the person would be looking at a single
 * session in the rail above a note saying they had none left.
 *
 * The marker is a row in the same table under the conversation's own scope,
 * so no migration is needed and the write is the same idempotent RPC. It is
 * written with `by: 0` when it already exists, so re-marking cannot inflate
 * anything; all that matters is whether the row is there at all.
 */
export async function chatAlreadyCounted(
  userId: string | null,
  sessionId: string | null | undefined,
  /** which conversations: Logos lines of thinking (`chats`) or Core chats (`core-chats`) */
  counter: 'chats' | 'core-chats' = 'chats'
): Promise<boolean> {
  if (!userId || !sessionId) return false;
  try {
    const { data, error } = await supabaseAdmin()
      .from('logos_usage')
      .select('n')
      .eq('user_id', userId)
      .eq('scope', chatMarkerScope(sessionId))
      .eq('counter', counter)
      .maybeSingle();
    if (error) {
      if (!unavailable(error)) console.error('chat marker read:', error.message);
      // Unreachable store fails OPEN, like everything else here: a person who
      // cannot be checked is let through rather than charged twice.
      return false;
    }
    return typeof data?.n === 'number' && data.n > 0;
  } catch {
    return false;
  }
}

/** Remember that this conversation has cost its one chat. */
export async function markChatCounted(
  userId: string | null,
  sessionId: string | null | undefined,
  counter: 'chats' | 'core-chats' = 'chats'
): Promise<void> {
  if (!userId || !sessionId) return;
  try {
    await supabaseAdmin().rpc('bump_logos_usage', {
      p_user: userId,
      p_scope: chatMarkerScope(sessionId),
      p_counter: counter,
      p_by: 1,
      p_at: Date.now(),
    });
  } catch {
    /* a missing marker costs at most one double-charge; never a failed turn */
  }
}

// (THE FIRST THOUGHT IS FREE — the sentence onboarding sent for somebody was
// not one of their month's chats, once per account, marked in the
// 'first-thought' scope — lived here. It was retired with the other free-tier
// gifts in the freemium change of October 2026, docs/FREEMIUM.md: the first
// conversation is counted like every other. Marker rows already written stay
// where they are and are read by nothing.)

export interface Allowance {
  /** false when this action is past the plan's limit */
  ok: boolean;
  used: number;
  limit: number | null;
  /** refused because the usage table is missing, not because the allowance is spent */
  unavailable?: boolean;
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
  if (await pausedForMissingStore(plan, counter)) return { ok: false, used: 0, limit, unavailable: true };
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
