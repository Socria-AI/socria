// app/api/shared/conversation/[id]/route.ts
// GET  ?since=  → a conversation someone shared with you (or yours, while it
//                is shared): its turns, its map, and what you may do with it.
//                `since` returns {unchanged} when nothing moved — the cheap
//                poll that keeps two people's screens in step.
// POST {base, append?, map?, title?} → add to it, as your role allows:
//        append   turns (yours and Socria's answer) — needs `ask`
//        map      the Logos map                     — needs `edit`
//        title                                       — needs `edit`
//
// THE OWNER'S ROW, REACHED THROUGH THE GATE. Every read and write here is
// the owner's conversation, keyed to them, and only after shareAccess has
// answered with a role for the caller (lib/share/server.ts).
//
// SIMULTANEOUS EDITS. Two people may add turns at the same moment. Appends
// are applied to the row as it stands and written only if it has not changed
// since it was read (updated_at as the version); a lost race re-reads and
// re-applies, so both sets of turns land, in arrival order. A MAP is a whole
// structure rather than a list, so a map written against an older version
// than the row's is refused with the current one (409) for the client to
// merge — silently overwriting someone's map is the one thing this must not
// do.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createHash } from 'node:crypto';
import { enforceRateLimit } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase';
import { sanitizeMap } from '@/lib/logos';
import { sanitizeContexts } from '@/lib/logos-sources';
import { can, type Role } from '@/lib/share/roles';
import { displayNameOf, isShared, noteChange, shareAccess } from '@/lib/share/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };
const MAX_MESSAGES = 200;
const MAX_CONTENT = 40_000;
const MAX_APPEND = 4;

/** An author mark that names the person without exposing their account id. */
function byOf(shareSalt: string, userId: string, name: string, role: Role) {
  return { id: createHash('sha256').update(`${shareSalt}:${userId}`).digest('hex').slice(0, 12), name: name.slice(0, 40), seat: role === 'owner' ? 'host' : 'guest' };
}

async function load(ownerId: string, id: string) {
  const { data, error } = await supabaseAdmin()
    .from('conversations')
    .select('id, title, kind, messages, map, project_id, updated_at')
    .eq('id', id).eq('user_id', ownerId).maybeSingle();
  if (error) throw error;
  return data as Record<string, unknown> | null;
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'room');
  if (limited) return limited;
  const access = await shareAccess(userId, 'conversation', params.id).catch(() => null);
  if (!access) return NextResponse.json({ error: 'No such conversation.' }, { status: 404 });
  const row = await load(access.ownerId, params.id).catch(() => null);
  if (!row) return NextResponse.json({ error: 'No such conversation.' }, { status: 404 });
  const updatedAt = Number(row.updated_at) || 0;
  const since = Number(req.nextUrl.searchParams.get('since'));
  if (since && updatedAt <= since) return NextResponse.json({ unchanged: true, updatedAt });
  return NextResponse.json({
    role: access.role,
    // does anybody besides the owner reach it — the owner's client syncs
    // through this route only while it is shared
    shared: access.role !== 'owner' || (await isShared('conversation', params.id).catch(() => false)),
    owner: await displayNameOf(access.ownerId),
    may: { ask: can(access.role, 'ask'), edit: can(access.role, 'edit'), comment: can(access.role, 'comment'), share: can(access.role, 'share') },
    conversation: {
      id: row.id,
      title: row.title,
      kind: row.kind === 'logos' ? 'logos' : 'chat',
      messages: Array.isArray(row.messages) ? row.messages : [],
      map: row.kind === 'logos' ? row.map ?? null : null,
      projectId: row.project_id ?? null,
      updatedAt,
    },
  });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'room');
  if (limited) return limited;
  const access = await shareAccess(userId, 'conversation', params.id).catch(() => null);
  if (!access) return NextResponse.json({ error: 'No such conversation.' }, { status: 404 });
  const body = await req.json().catch(() => null);

  const wantsAppend = Array.isArray(body?.append) && body.append.length > 0;
  const wantsMap = body?.map !== undefined;
  const wantsTitle = typeof body?.title === 'string';
  // The Draft Space and the material attached to nodes are the OWNER'S own
  // writing and sources, kept with their session: only they may write them
  // here (their client saves a shared session through this route alone).
  const wantsOwn = body?.draft !== undefined || body?.contexts !== undefined;
  if (wantsOwn && access.role !== 'owner') return NextResponse.json({ error: 'Only the owner keeps a draft here.' }, { status: 403 });
  if (wantsAppend && !can(access.role, 'ask')) return NextResponse.json({ error: 'You can read this, but not add to it.' }, { status: 403 });
  if ((wantsMap || wantsTitle) && !can(access.role, 'edit')) return NextResponse.json({ error: 'You can read this, but not change it.' }, { status: 403 });
  if (!wantsAppend && !wantsMap && !wantsTitle && !wantsOwn) return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });

  const name = await displayNameOf(userId);
  const by = byOf(access.shareId ?? params.id, userId, name, access.role);
  const append = wantsAppend
    ? (body.append as unknown[]).slice(0, MAX_APPEND).map((m) => {
        const r = (m && typeof m === 'object' ? m : {}) as Record<string, unknown>;
        const role = r.role === 'assistant' ? 'assistant' : 'user';
        const content = typeof r.content === 'string' ? r.content.slice(0, MAX_CONTENT) : '';
        // a person's turn is theirs, named; Socria's answer is Socria's
        return role === 'user' ? { role, content, by } : { role, content };
      }).filter((m) => m.content.trim())
    : [];
  const base = Number(body?.base) || 0;

  for (let attempt = 0; attempt < 5; attempt++) {
    const row = await load(access.ownerId, params.id).catch(() => null);
    if (!row) return NextResponse.json({ error: 'No such conversation.' }, { status: 404 });
    const current = Number(row.updated_at) || 0;
    if (wantsMap && base && base !== current) {
      // someone else changed it since this map was drawn: merge, don't clobber
      return NextResponse.json({ conflict: true, updatedAt: current, map: row.map ?? null, messages: row.messages ?? [] }, { status: 409 });
    }
    const messages = [...(Array.isArray(row.messages) ? row.messages : []), ...append].slice(-MAX_MESSAGES);
    const patch: Record<string, unknown> = { updated_at: Math.max(Date.now(), current + 1) };
    if (append.length) patch.messages = messages;
    if (wantsMap) patch.map = sanitizeMap(body.map);
    if (wantsTitle) patch.title = String(body.title).replace(/\s+/g, ' ').trim().slice(0, 200) || row.title;
    if (body?.draft !== undefined) {
      const d = body.draft;
      patch.draft = d && typeof d === 'object' && typeof d.html === 'string'
        ? { title: typeof d.title === 'string' ? d.title.slice(0, 200) : '', html: d.html.slice(0, 200_000) }
        : null;
    }
    if (body?.contexts !== undefined) patch.contexts = sanitizeContexts(body.contexts);
    const { error, count } = await supabaseAdmin()
      .from('conversations')
      .update(patch, { count: 'exact' })
      .eq('id', params.id).eq('user_id', access.ownerId).eq('updated_at', current);
    if (error) {
      console.error('[shared/conversation] write failed', error);
      return NextResponse.json({ error: 'That could not be saved just now.' }, { status: 500 });
    }
    if (count) {
      if (append.some((m) => m.role === 'user')) await noteChange(userId, 'conversation', params.id, 'message', `${name} added to the conversation`);
      if (wantsMap) await noteChange(userId, 'conversation', params.id, 'map', `${name} changed the map`);
      if (wantsTitle) await noteChange(userId, 'conversation', params.id, 'rename', `${name} renamed it`);
      return NextResponse.json({ ok: true, updatedAt: patch.updated_at, messages: append.length ? messages : row.messages ?? [] });
    }
    // lost a race with another writer: read again and re-apply
  }
  return NextResponse.json({ error: 'Too many people writing at once — try again.' }, { status: 409 });
}
