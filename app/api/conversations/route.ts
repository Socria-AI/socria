// app/api/conversations/route.ts
// GET  /api/conversations          → list current user's conversations
// PUT  /api/conversations          → upsert a single conversation
// POST /api/conversations          → bulk-upsert (used for localStorage → cloud migration)

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sanitizeMemory, EMPTY_MEMORY } from '@/lib/socria-prompt';
import { EMPTY_MAP, sanitizeMap } from '@/lib/logos';
import { sanitizeAttachments } from '@/lib/logos-attachments';
import { sanitizeContexts } from '@/lib/logos-sources';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_TITLE = 200;
const MAX_MESSAGES_PER_CONVO = 200;
const MAX_BULK_CONVOS = 200;

type Msg = {
  role: 'user' | 'assistant';
  content: string;
  attachments?: ReturnType<typeof sanitizeAttachments>;
};

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
    .map((m: any) => {
      const attachments = sanitizeAttachments(m.attachments);
      return attachments.length
        ? { role: m.role, content: m.content, attachments }
        : { role: m.role, content: m.content };
    });
}

// Logos sessions live in the same table as ordinary chats, so both surfaces
// list one another's work instead of each keeping a private drawer.
type Kind = 'chat' | 'logos';
const asKind = (v: unknown): Kind => (v === 'logos' ? 'logos' : 'chat');

// ── legacy-database fallback ────────────────────────────────────────
// kind/map/draft/contexts arrived after the original conversations table, as
// idempotent ALTERs in supabase/schema.sql. A deployment whose database never
// ran them used to hard-fail the moment someone signed in ("column
// conversations.kind does not exist"). The app cannot ALTER TABLE through
// PostgREST, so instead: detect the missing column, retry with the columns
// every database has, and keep chat working while saying — loudly, on the
// server — exactly what to run.
//
// Postgres reports 42703 on select; PostgREST reports PGRST204 ("Could not
// find the '…' column in the schema cache") on insert/upsert.
function missingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '42703' || error.code === 'PGRST204') return true;
  return /column .* does not exist|could not find the '.*' column/i.test(error.message ?? '');
}

// Where the Logos fields go when their columns don't exist yet.
//
// `memory` is jsonb and has existed since the first schema, so on an
// un-migrated database we park kind/map/draft/contexts inside it under this
// key rather than dropping them. Without this, a Logos session round-trips
// with no `kind`, comes back as 'chat', and disappears from the Logos rail
// while cluttering the Core chat list — which reads to the person as
// "Logos chats aren't saving".
//
// Self-healing: once the migration runs, the real columns take precedence and
// the sidecar is simply ignored (and rehydrated for rows written before it).
const SIDECAR = '__logos';

interface Sidecar {
  kind?: unknown;
  map?: unknown;
  draft?: unknown;
  contexts?: unknown;
}

/** One stored row → the shape the clients expect, whichever schema wrote it. */
function shape(c: any) {
  const memory = c.memory ?? EMPTY_MEMORY;
  const side: Sidecar = (memory && typeof memory === 'object' && memory[SIDECAR]) || {};
  // Never let the sidecar leak into the memory the Core chat reads.
  let clean = memory;
  if (memory && typeof memory === 'object' && SIDECAR in memory) {
    clean = { ...memory };
    delete clean[SIDECAR];
  }
  return {
    id: c.id,
    title: c.title,
    messages: c.messages,
    memory: clean ?? EMPTY_MEMORY,
    // Real column first, sidecar second — so a migrated database wins and a
    // row written while degraded still comes back whole.
    kind: asKind(c.kind ?? side.kind),
    map: c.map ?? side.map ?? EMPTY_MAP,
    draft: c.draft ?? side.draft ?? null,
    contexts: c.contexts ?? side.contexts ?? null,
    updatedAt: Number(c.updated_at),
  };
}

let warnedLegacy = false;
function warnLegacy(op: string) {
  if (warnedLegacy) return;
  warnedLegacy = true;
  console.error(
    `conversations ${op}: this database is missing newer columns (kind/map/draft/contexts). ` +
      'Falling back to storing the Logos fields inside `memory` so nothing is lost — ' +
      'run supabase/schema.sql against this project (SQL Editor or psql) to restore ' +
      'proper columns; it is idempotent and the fallback rows rehydrate automatically.'
  );
}

// The draft is the person's own writing, so it is stored verbatim — only
// bounded, never reformatted or cleaned up on their behalf.
const MAX_DRAFT_HTML = 200_000;
function sanitizeDraft(raw: any): { title: string; html: string } | null {
  if (!raw || typeof raw !== 'object' || typeof raw.html !== 'string') return null;
  return {
    title: typeof raw.title === 'string' ? raw.title.slice(0, MAX_TITLE) : '',
    html: raw.html.slice(0, MAX_DRAFT_HTML),
  };
}

export async function GET() {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // `any[]`: the two selects below return different row shapes on purpose
    // (the fallback asks only for the columns every database has); the mapping
    // after them defaults whatever is absent.
    let data: any[] | null;
    let error;
    ({ data, error } = await supabaseAdmin()
      .from('conversations')
      .select('id, title, messages, memory, kind, map, draft, contexts, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false }));

    // An old database: list what it does have, defaulting the rest, so
    // signing in still works while the migration is outstanding.
    if (error && missingColumn(error)) {
      warnLegacy('GET');
      ({ data, error } = await supabaseAdmin()
        .from('conversations')
        .select('id, title, messages, memory, updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false }));
    }

    if (error) {
      console.error('GET conversations error:', error);
      return NextResponse.json(
        { error: `Supabase: ${error.message}` },
        { status: 500 }
      );
    }

    const conversations = (data || []).map(shape);
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
    const extras = {
      kind: asKind(c.kind),
      map: sanitizeMap(c.map ?? EMPTY_MAP),
      draft: sanitizeDraft(c.draft),
      contexts: sanitizeContexts(c.contexts),
    };
    const base = {
      id: c.id,
      user_id: userId,
      title: c.title.slice(0, MAX_TITLE),
      messages: sanitizeMessages(c.messages),
      memory: sanitizeMemory(c.memory ?? EMPTY_MEMORY),
      updated_at: Number(c.updatedAt) || Date.now(),
    };
    let { error } = await supabaseAdmin()
      .from('conversations')
      .upsert({ ...base, ...extras });

    // An old database: keep the Logos fields in `memory` rather than dropping
    // them, so the session still comes back as a Logos session.
    if (error && missingColumn(error)) {
      warnLegacy('PUT');
      ({ error } = await supabaseAdmin()
        .from('conversations')
        .upsert({ ...base, memory: { ...base.memory, [SIDECAR]: extras } }));
    }

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

  const usable = list
    .filter(
      (c: any) =>
        c && typeof c.id === 'string' && Array.isArray(c.messages)
    )
    .slice(0, MAX_BULK_CONVOS);
  const prepared = usable.map((c: any) => {
    const base = {
      id: c.id,
      user_id: userId,
      title: (typeof c.title === 'string' ? c.title : 'Imported session').slice(
        0,
        MAX_TITLE
      ),
      messages: sanitizeMessages(c.messages),
      memory: sanitizeMemory(c.memory ?? EMPTY_MEMORY),
      updated_at: Number(c.updatedAt) || Date.now(),
    };
    const extras = {
      kind: asKind(c.kind),
      map: sanitizeMap(c.map ?? EMPTY_MAP),
      draft: sanitizeDraft(c.draft),
      contexts: sanitizeContexts(c.contexts),
    };
    return { base, extras };
  });
  const rows = prepared.map(({ base, extras }) => ({ ...base, ...extras }));
  const legacyRows = prepared.map(({ base, extras }) => ({
    ...base,
    memory: { ...base.memory, [SIDECAR]: extras },
  }));

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, imported: 0 });
  }

  try {
    let { error } = await supabaseAdmin().from('conversations').upsert(rows);
    if (error && missingColumn(error)) {
      warnLegacy('POST');
      ({ error } = await supabaseAdmin().from('conversations').upsert(legacyRows));
    }
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
