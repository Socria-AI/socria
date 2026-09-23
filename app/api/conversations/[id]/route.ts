// app/api/conversations/[id]/route.ts
// DELETE /api/conversations/:id → delete one conversation for the current user.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import { deleteConversation } from '@/lib/core4/store';

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
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('DELETE conversation threw:', e);
    return NextResponse.json(
      { error: e?.message || 'Internal error' },
      { status: 500 }
    );
  }
}
