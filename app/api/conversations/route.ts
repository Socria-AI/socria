// app/api/conversations/route.ts
// GET  /api/conversations          → list current user's conversations
// PUT  /api/conversations          → upsert a single conversation
// POST /api/conversations          → bulk-upsert (used for localStorage → cloud migration)

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sanitizeMemory, EMPTY_MEMORY } from '@/lib/socria-prompt';
import { EMPTY_MAP, sanitizeMap } from '@/lib/logos';

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

// Logos sessions live in the same table as ordinary chats, so both surfaces
// list one another's work instead of each keeping a private drawer.
type Kind = 'chat' | 'logos';
const asKind = (v: unknown): Kind => (v === 'logos' ? 'logos' : 'chat');

export async function GET() {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data, error } = await supabaseAdmin()
      .from('conversations')
      .select('id, title, messages, memory, kind, map, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('GET conversations error:', error);
      return NextResponse.json(
        { error: `Supabase: ${error.message}` },
        { status: 500 }
      );
    }

    const conversations = (data || []).map((c: any) => ({
      id: c.id,
      title: c.title,
      messages: c.messages,
      memory: c.memory ?? EMPTY_MEMORY,
      kind: asKind(c.kind),
      map: c.map ?? EMPTY_MAP,
      updatedAt: Number(c.updated_at),
    }));
    return NextResponse.json({ conversations });
  } catch (e: any) {
    console.error('GET conversations threw:', e);
    return NextResponse.json(
      { error: e?.message || 'Internal error' },
      { status: 500 }
    );
  }
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

  try {
    const { error } = await supabaseAdmin().from('conversations').upsert({
      id: c.id,
      user_id: userId,
      title: c.title.slice(0, MAX_TITLE),
      messages: sanitizeMessages(c.messages),
      memory: sanitizeMemory(c.memory ?? EMPTY_MEMORY),
      kind: asKind(c.kind),
      map: sanitizeMap(c.map ?? EMPTY_MAP),
      updated_at: Number(c.updatedAt) || Date.now(),
    });

    if (error) {
      console.error('PUT conversation error:', error);
      return NextResponse.json(
        { error: `Supabase: ${error.message}` },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('PUT conversation threw:', e);
    return NextResponse.json(
      { error: e?.message || 'Internal error' },
      { status: 500 }
    );
  }
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
      memory: sanitizeMemory(c.memory ?? EMPTY_MEMORY),
      kind: asKind(c.kind),
      map: sanitizeMap(c.map ?? EMPTY_MAP),
      updated_at: Number(c.updatedAt) || Date.now(),
    }));

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, imported: 0 });
  }

  try {
    const { error } = await supabaseAdmin().from('conversations').upsert(rows);
    if (error) {
      console.error('POST conversations error:', error);
      return NextResponse.json(
        { error: `Supabase: ${error.message}` },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, imported: rows.length });
  } catch (e: any) {
    console.error('POST conversations threw:', e);
    return NextResponse.json(
      { error: e?.message || 'Internal error' },
      { status: 500 }
    );
  }
}
