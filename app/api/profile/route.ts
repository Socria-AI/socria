// app/api/profile/route.ts
// GET /api/profile → { profile: string | null } for the signed-in user
// PUT /api/profile → save { profile } (empty string clears it)
//
// Backs the "import your history from other AIs" feature: the pasted profile
// is stored per user so it follows them across devices. Anonymous users keep
// theirs in localStorage only; if the user_profiles table doesn't exist yet
// the client silently falls back to local-only.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sanitizeImportedProfile } from '@/lib/socria-prompt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { data, error } = await supabaseAdmin()
      .from('user_profiles')
      .select('profile')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      console.error('GET profile error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ profile: data?.profile ?? null });
  } catch (e: any) {
    console.error('GET profile error:', e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => null);
    const profile = sanitizeImportedProfile(body?.profile);
    const { error } = await supabaseAdmin()
      .from('user_profiles')
      .upsert(
        { user_id: userId, profile, updated_at: Date.now() },
        { onConflict: 'user_id' }
      );
    if (error) {
      console.error('PUT profile error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, profile });
  } catch (e: any) {
    console.error('PUT profile error:', e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}
