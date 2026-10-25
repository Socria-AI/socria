// app/api/conversations/[id]/route.ts
// DELETE /api/conversations/:id → delete one conversation for the current user,
// and with it what Core 4 and Metacognitive Regulation kept about it and the
// pictures its writing held.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import { deleteConversation } from '@/lib/core4/store';
import { forgetConversation as forgetMrConversation } from '@/lib/mr/store';
import { cleanId } from '@/lib/mind/logos-turn';
import { releaseDraftMedia } from '@/lib/write/media-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // the writing, read before the row goes, for the pictures it holds (on a
    // database without the draft column the writing is kept in the memory's
    // sidecar instead, and its pictures stay until the account goes)
    const before = await supabaseAdmin().from('conversations').select('draft').eq('id', params.id).eq('user_id', userId).maybeSingle();
    const draft = before.error ? null : (before.data as { draft?: unknown } | null)?.draft ?? null;

    const { error } = await supabaseAdmin()
      .from('conversations')
      .delete()
      .eq('id', params.id)
      .eq('user_id', userId);

    if (error) {
      console.error('DELETE conversation error:', error);
      return NextResponse.json(
        { error: `Supabase: ${error.message}` },
        { status: 500 }
      );
    }
    // Everything Core 4 kept about this conversation goes with it.
    try {
      await deleteConversation(userId, params.id);
    } catch (e) {
      console.error('DELETE conversation: core 4 cascade failed', e);
      return NextResponse.json({ error: 'The conversation was deleted, but Socria could not remove everything it kept about it. Please try again.' }, { status: 500 });
    }
    // …and MR's ledger rows for it. They are keyed by the id as the Logos route
    // received it (cleanId), so an id of any other shape has none. The
    // conversation is marked forgotten in their MR settings BEFORE its rows
    // go (lib/mr/store.ts forgetConversation): a turn of it still streaming
    // writes its rows after this, and the mark is how it knows not to — and
    // a "from now on" they took back in it is kept there, so deleting the
    // conversation does not bring the preference back everywhere.
    const mrKey = cleanId(params.id);
    const mrGone = !mrKey || (await forgetMrConversation(userId, mrKey)).ok;
    // its pictures, unless another of their drafts still holds one (best effort:
    // a picture that cannot be released is kept, and goes with the account).
    // Before reporting an MR failure, not after: the row is already gone, so a
    // retry reads no draft and could never release them.
    await releaseDraftMedia(userId, draft);
    if (!mrGone) {
      console.error('DELETE conversation: mr cascade failed');
      return NextResponse.json({ error: 'The conversation was deleted, but Socria could not remove everything it kept about it. Please try again.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('DELETE conversation threw:', e);
    return NextResponse.json(
      { error: e?.message || 'Internal error' },
      { status: 500 }
    );
  }
}
