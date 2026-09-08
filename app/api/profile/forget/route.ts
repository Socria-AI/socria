// app/api/profile/forget/route.ts
// POST { id } → { understanding }
//
// Forget one thing Socria knows about the person.
//
// This is a route of its own, rather than the client removing the entry and
// syncing, because a forgotten thing has to STAY forgotten: the next
// extraction may propose the same sentence again, and another device may
// still hold the old copy. The server removes the entry from the row it owns
// and leaves a tombstone beside it — the fingerprint of what was said — and
// every later merge refuses anything that matches. See lib/person-memory.ts.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sanitizeUserUnderstanding, type UserUnderstanding } from '@/lib/socria-prompt';
import { forgetEntry } from '@/lib/person-memory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!id) {
    return NextResponse.json({ error: 'Which one?' }, { status: 400 });
  }

  try {
    const { data, error } = await supabaseAdmin()
      .from('user_profiles')
      .select('understanding')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      console.error('forget: could not read', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const current = sanitizeUserUnderstanding((data as { understanding?: unknown } | null)?.understanding);
    const { entries, forgotten } = forgetEntry(current.entries, current.forgotten, id);
    const understanding: UserUnderstanding = {
      ...current,
      entries,
      forgotten,
      updatedAt: Date.now(),
    };
    const { error: writeError } = await supabaseAdmin()
      .from('user_profiles')
      .upsert({ user_id: userId, understanding, updated_at: Date.now() }, { onConflict: 'user_id' });
    if (writeError) {
      console.error('forget: could not write', writeError);
      return NextResponse.json({ error: writeError.message }, { status: 500 });
    }
    return NextResponse.json({ understanding });
  } catch (e: any) {
    console.error('forget threw:', e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}
