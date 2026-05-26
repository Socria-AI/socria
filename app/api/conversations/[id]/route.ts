// app/api/conversations/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getSupabaseAdmin();
  const { data: conv } = await db
    .from('conversations')
    .select('id, user_id, title, created_at, updated_at')
    .eq('id', id)
    .maybeSingle();

  if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (conv.user_id !== userId)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: messages } = await db
    .from('messages')
    .select('id, conversation_id, role, content, created_at')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true });

  return NextResponse.json({ conversation: conv, messages: messages || [] });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getSupabaseAdmin();
  const { data: conv } = await db
    .from('conversations')
    .select('user_id')
    .eq('id', id)
    .maybeSingle();

  if (!conv) return NextResponse.json({ ok: true });
  if (conv.user_id !== userId)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // ON DELETE CASCADE removes messages
  const { error } = await db.from('conversations').delete().eq('id', id);
  if (error) {
    console.error(error);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
