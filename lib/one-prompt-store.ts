// lib/one-prompt-store.ts
//
// How often we have already asked, remembered per account rather than per
// browser.
//
// Why this is server-side at all: the cooldown after someone dismisses a
// proactive prompt is measured in weeks, and localStorage does not survive a
// different device, a private window, or clearing site data. A cooldown that
// resets when you open Socria on your phone is not a cooldown — it is a
// slower way of asking every time.
//
// Why it needs no new table: `logos_usage` is already (user_id, scope,
// counter, n, updated_at) with an atomic increment behind it, and `scope` and
// `counter` are free text. Dismissals are exactly that shape — a count and
// the time it last changed — so they live in the same table under a scope of
// their own. One migration, not two, and the increment is already race-free.
//
// The scope string is deliberately not a month key, so these rows never
// collide with a metered counter and are never swept by anything that
// reasons about months.

import { supabaseAdmin } from './supabase';

/** Not a Counter from lib/entitlements — nothing here meters an entitlement. */
export const PROMPT_SCOPE = 'one-prompt';
export const DISMISSED = 'dismissed';

export interface StoredPromptState {
  dismissals: number;
  lastDismissedAt: number;
}

/** Same detection as lib/usage.ts: a missing table is absence, not an error. */
function unavailable(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const m = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
  return (
    m.includes('does not exist') ||
    m.includes('could not find') ||
    m.includes('schema cache') ||
    m.includes('42p01') ||
    m.includes('42883')
  );
}

/**
 * What this account has dismissed, or null when the store cannot answer.
 *
 * null is distinct from a zeroed state on purpose. Zero means "we asked and
 * they have never dismissed one"; null means "we do not know", and the caller
 * falls back to what the browser remembers rather than treating an unmigrated
 * database as permission to start asking again.
 */
export async function readPromptState(userId: string): Promise<StoredPromptState | null> {
  try {
    const { data, error } = await supabaseAdmin()
      .from('logos_usage')
      .select('n, updated_at')
      .eq('user_id', userId)
      .eq('scope', PROMPT_SCOPE)
      .eq('counter', DISMISSED)
      .maybeSingle();
    if (error) {
      if (!unavailable(error)) console.error('one-prompt read:', error.message);
      return null;
    }
    if (!data) return { dismissals: 0, lastDismissedAt: 0 };
    const row = data as { n?: number; updated_at?: number };
    return {
      dismissals: typeof row.n === 'number' ? row.n : 0,
      lastDismissedAt: typeof row.updated_at === 'number' ? row.updated_at : 0,
    };
  } catch {
    return null;
  }
}

/**
 * Record a dismissal and return the new count, or null if it could not be
 * written. Reuses bump_logos_usage, so two tabs dismissing at once cannot
 * lose a count the way a read-then-write would.
 */
export async function recordDismissal(
  userId: string,
  at = Date.now()
): Promise<number | null> {
  try {
    const { data, error } = await supabaseAdmin().rpc('bump_logos_usage', {
      p_user: userId,
      p_scope: PROMPT_SCOPE,
      p_counter: DISMISSED,
      p_by: 1,
      p_at: at,
    });
    if (error) {
      if (!unavailable(error)) console.error('one-prompt bump:', error.message);
      return null;
    }
    return typeof data === 'number' ? data : null;
  } catch {
    return null;
  }
}
