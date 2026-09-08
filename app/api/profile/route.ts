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
import {
  sanitizeImportedProfile,
  sanitizeUserUnderstanding,
  hasJourneyContent,
} from '@/lib/socria-prompt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    let { data, error } = await supabaseAdmin()
      .from('user_profiles')
      .select('profile, understanding')
      .eq('user_id', userId)
      .maybeSingle();
    // Deploy-order tolerance: if the understanding column hasn't been added
    // to the database yet (42703 undefined column), fall back to
    // profile-only so existing sync keeps working.
    if (error && (error as any).code === '42703') {
      const retry = await supabaseAdmin()
        .from('user_profiles')
        .select('profile')
        .eq('user_id', userId)
        .maybeSingle();
      data = retry.data as any;
      error = retry.error;
    }
    if (error) {
      console.error('GET profile error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const understanding = (data as any)?.understanding
      ? sanitizeUserUnderstanding((data as any).understanding)
      : null;
    return NextResponse.json({
      profile: data?.profile ?? null,
      // A CLEARED row is not the same as no row. "Forget everything" leaves a
      // stamped but empty understanding; answering null for it told the
      // browser the account had nothing, and the browser — which still had
      // the old journey in localStorage — helpfully pushed it back up. So an
      // understanding that has been written at all comes back, empty or not,
      // and the client's newest-wins sync sees a clear that is newer than
      // what it holds.
      understanding:
        understanding && (hasJourneyContent(understanding) || understanding.updatedAt > 0)
          ? understanding
          : null,
    });
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
    const b: Record<string, unknown> =
      body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    // Partial update: only the fields present in the body are written, so a
    // journey sync can never clobber the imported profile and vice versa.
    const row: Record<string, unknown> = {
      user_id: userId,
      updated_at: Date.now(),
    };
    if ('profile' in b) {
      row.profile = sanitizeImportedProfile(b.profile);
    }
    if ('understanding' in b) {
      // The journey fields are the client's to sync. The ENTRIES and the
      // tombstones are not: the server merges those in
      // /api/update-understanding and forgets them in /api/profile/forget,
      // and a client posting its own copy — a stale tab, an older bundle —
      // would wipe or resurrect them. So the row's entries are kept, whatever
      // the body says. If the row cannot be read, nothing is written rather
      // than risk writing a journey with the entries missing; the client
      // syncs again on its next turn.
      const incoming = sanitizeUserUnderstanding(b.understanding);
      const { data: cur, error: readError } = await supabaseAdmin()
        .from('user_profiles')
        .select('understanding')
        .eq('user_id', userId)
        .maybeSingle();
      if (readError) {
        console.error('PUT profile: could not read the current understanding', readError);
        return NextResponse.json({ error: readError.message }, { status: 500 });
      }
      const held = sanitizeUserUnderstanding((cur as { understanding?: unknown } | null)?.understanding);
      row.understanding = { ...incoming, entries: held.entries, forgotten: held.forgotten };
    }
    const { error } = await supabaseAdmin()
      .from('user_profiles')
      .upsert(row, { onConflict: 'user_id' });
    if (error) {
      console.error('PUT profile error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('PUT profile error:', e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}
