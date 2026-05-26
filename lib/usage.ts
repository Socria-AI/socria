// lib/usage.ts
// Daily rate limit + usage tracking, backed by Supabase `usage` table.

import { getSupabaseAdmin } from './supabase';

const DAILY_LIMIT = parseInt(process.env.DAILY_MESSAGE_LIMIT || '100', 10);

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Check if the user is over the daily message cap.
 * Returns { allowed, used, limit }.
 */
export async function checkRateLimit(userId: string) {
  const db = getSupabaseAdmin();
  const date = today();

  const { data, error } = await db
    .from('usage')
    .select('message_count')
    .eq('user_id', userId)
    .eq('date', date)
    .maybeSingle();

  if (error) {
    console.error('checkRateLimit error:', error);
    // Fail open — don't block users on transient DB errors.
    return { allowed: true, used: 0, limit: DAILY_LIMIT };
  }

  const used = data?.message_count ?? 0;
  return { allowed: used < DAILY_LIMIT, used, limit: DAILY_LIMIT };
}

/**
 * Increment usage for the day. Upserts row if missing.
 */
export async function trackUsage(
  userId: string,
  tokens: number
): Promise<void> {
  const db = getSupabaseAdmin();
  const date = today();

  // Try update first
  const { data: existing } = await db
    .from('usage')
    .select('message_count, token_estimate')
    .eq('user_id', userId)
    .eq('date', date)
    .maybeSingle();

  if (existing) {
    await db
      .from('usage')
      .update({
        message_count: existing.message_count + 1,
        token_estimate: existing.token_estimate + tokens,
      })
      .eq('user_id', userId)
      .eq('date', date);
  } else {
    await db.from('usage').insert({
      user_id: userId,
      date,
      message_count: 1,
      token_estimate: tokens,
    });
  }
}
