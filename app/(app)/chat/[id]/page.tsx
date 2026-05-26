// app/(app)/chat/[id]/page.tsx
import { auth } from '@clerk/nextjs/server';
import { redirect, notFound } from 'next/navigation';
import { getSupabaseAdmin } from '@/lib/supabase';
import { ChatView } from '@/components/ChatView';
import type { Message } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Thought session — Socria' };

export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const db = getSupabaseAdmin();

  // Verify ownership
  const { data: conv } = await db
    .from('conversations')
    .select('id, user_id')
    .eq('id', id)
    .maybeSingle();

  if (!conv || conv.user_id !== userId) {
    notFound();
  }

  const { data: messages } = await db
    .from('messages')
    .select('id, conversation_id, role, content, created_at')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true });

  return (
    <ChatView
      conversationId={id}
      initialMessages={(messages || []) as Message[]}
    />
  );
}
