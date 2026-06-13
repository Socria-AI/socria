// app/api/conversations/[id]/route.ts
// DELETE /api/conversations/:id → delete one conversation for the current user.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';

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

  const { error } = await supabaseAdmin()
    .from('conversations')
    .delete()
    .eq('id', params.id)
    .eq('user_id', userId);

  if (error) {
    console.error('DELETE conversation error:', error);
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
