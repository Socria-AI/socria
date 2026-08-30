// app/api/conversations/route.ts
// GET  /api/conversations          → list current user's conversations
// PUT  /api/conversations          → upsert a single conversation
// POST /api/conversations          → bulk-upsert (used for localStorage → cloud migration)

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_TITLE = 200;
const MAX_MESSAGES_PER_CONVO = 200;
const MAX_BULK_CONVOS = 200;

type Msg = { role: 'user' | 'assistant'; content: string };

function sanitizeMessages(raw: unknown): Msg[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (m: any) =>
        m &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string'
    )
    .slice(-MAX_MESSAGES_PER_CONVO)
    .map((m: any) => ({ role: m.role, content: m.content }));
}

export async function GET() {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin()
    .from('conversations')
    .select('id, title, messages, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('GET conversations error:', error);
    return NextResponse.json({ error: 'Failed to load' }, { status: 500 });
  }

  const conversations = (data || []).map((c) => ({
    id: c.id,
    title: c.title,
    messages: c.messages,
    updatedAt: Number(c.updated_at),
  }));
  return NextResponse.json({ conversations });
}

export async function PUT(req: NextRequest) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const c = body?.conversation;
  if (
    !c ||
    typeof c.id !== 'string' ||
    typeof c.title !== 'string' ||
    !Array.isArray(c.messages)
  ) {
    return NextResponse.json({ error: 'Invalid conversation' }, { status: 400 });
  }

  // conversations.id is the SOLE primary key, so an upsert conflicts on the id
  // alone and will happily overwrite a row belonging to somebody else — taking
  // ownership of it, since user_id is part of what gets written. A signed-in
  // caller who knew another account's conversation id could replace its title
  // and its messages.
  //
  // So: update only a row this account already owns, and fall back to an
  // insert when no such row exists. A primary-key collision on that insert
  // means the id belongs to someone else, which is a 403 rather than an error.
  const row = {
    user_id: userId,
    title: c.title.slice(0, MAX_TITLE),
    messages: sanitizeMessages(c.messages),
    updated_at: Number(c.updatedAt) || Date.now(),
  };

  const { error: updateError, count } = await supabaseAdmin()
    .from('conversations')
    .update(row, { count: 'exact' })
    .eq('id', c.id)
    .eq('user_id', userId);

  if (updateError) {
    console.error('PUT conversation error:', updateError);
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }

  if (!count) {
    const { error: insertError } = await supabaseAdmin()
      .from('conversations')
      .insert({ id: c.id, ...row });
    if (insertError) {
      // 23505 is unique_violation: the id exists and is not ours.
      if (insertError.code === '23505') {
        return NextResponse.json({ error: 'Not found' }, { status: 403 });
      }
      console.error('PUT conversation error:', insertError);
      return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const list = body?.conversations;
  if (!Array.isArray(list)) {
    return NextResponse.json(
      { error: 'conversations array required' },
      { status: 400 }
    );
  }

  const rows = list
    .filter(
      (c: any) =>
        c && typeof c.id === 'string' && Array.isArray(c.messages)
    )
    .slice(0, MAX_BULK_CONVOS)
    .map((c: any) => ({
      id: c.id,
      user_id: userId,
      title: (typeof c.title === 'string' ? c.title : 'Imported session').slice(
        0,
        MAX_TITLE
      ),
      messages: sanitizeMessages(c.messages),
      updated_at: Number(c.updatedAt) || Date.now(),
    }));

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, imported: 0 });
  }

  // Same hazard as PUT: this upsert conflicts on id alone, so a caller could
  // hand us somebody else's conversation ids and overwrite their rows. This is
  // the sign-in migration path, where every id SHOULD be new to us — so drop
  // any id that already exists and does not belong to this account, rather
  // than letting it through and taking the row.
  const { data: existing } = await supabaseAdmin()
    .from('conversations')
    .select('id, user_id')
    .in(
      'id',
      rows.map((r) => r.id)
    );
  const foreign = new Set(
    (existing ?? [])
      .filter((r: { user_id: string }) => r.user_id !== userId)
      .map((r: { id: string }) => r.id)
  );
  const mine = rows.filter((r) => !foreign.has(r.id));
  if (foreign.size) {
    console.warn(
      `POST conversations: skipped ${foreign.size} id(s) owned by another account`
    );
  }
  if (mine.length === 0) {
    return NextResponse.json({ ok: true, imported: 0 });
  }

  const { error } = await supabaseAdmin().from('conversations').upsert(mine);
  if (error) {
    console.error('POST conversations error:', error);
    return NextResponse.json({ error: 'Failed to import' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, imported: mine.length });
}
