// lib/ensure-user.ts
// Mirrors the Clerk user into our `users` table on first request.
// Called from server components / API routes.

import { getSupabaseAdmin } from './supabase';

export async function ensureUserExists(
  clerkId: string,
  email?: string | null
): Promise<void> {
  if (!clerkId) return;
  const db = getSupabaseAdmin();

  const { data } = await db
    .from('users')
    .select('id')
    .eq('id', clerkId)
    .maybeSingle();

  if (!data) {
    await db.from('users').insert({
      id: clerkId,
      email: email ?? null,
    });
  }
}
