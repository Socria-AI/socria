// lib/supabase.ts
// Two clients:
//   - supabaseAdmin: server-only, uses SERVICE_ROLE_KEY. Never import in client code.
//   - supabaseAnon: safe for client/browser use (anon key only).

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Browser-safe client (public anon key only)
export const supabaseAnon: SupabaseClient = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false },
});

// Server-only client. Has full DB access — keep server-side.
export function getSupabaseAdmin(): SupabaseClient {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY missing on server');
  }
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
