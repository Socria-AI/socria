// app/api/logos/room/events/route.ts
// GET  ?roomId=&since=  → events after a cursor, plus who is present.
// POST { roomId, events }→ append events authored by the caller.
//
// THE WHOLE POINT OF THIS FILE is the two lines in each handler that read the
// Clerk session and then call membershipOf(). Before, a browser holding the
// public anon key and a six-character code talked to Supabase Realtime
// directly — no session, no membership check, no server in the path at all —
// so a stranger who guessed or was told a code received every message in the
// room and nobody could see them there. Now a request with no session gets
// 401, and a session that is not a member of the room gets 404 whether or not
// the room exists. There is no third answer.

import { NextRequest, NextResponse } from 'next/server';
import { roomsEnabled } from '@/lib/rooms-flag';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import {
  appendEvent,
  eventsSince,
  membersOf,
  membershipOf,
} from '@/lib/logos-rooms-server';
import { MAX_BATCH, MAX_BATCH_BYTES, sanitizeEvent } from '@/lib/collab-transport';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The batch limits — at most MAX_BATCH events in one request, MAX_BATCH_BYTES
// serialised — are the transport's own constants, so the client batches by the
// very measure this route refuses by and a 413 is never a surprise.
//
// NOTHING REFUSED HERE IS REFUSED QUIETLY. An event the sanitiser rejects, or
// one past the batch limit, is named in `dropped`; the transport reports it to
// the room. An event that failed to be written (the database, not the event)
// makes the whole answer a 503, which the transport tries again — a repeat of
// one that did land is forgiven by its id.

function notAMember(): NextResponse {
  // Deliberately indistinguishable from "no such room": a member of no room
  // learns nothing about which rooms exist.
  return NextResponse.json({ error: 'No such room.' }, { status: 404 });
}

export async function GET(req: NextRequest) {
  // Parked until it ships — see lib/rooms-flag.ts.
  if (!roomsEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'room');
  if (limited) return limited;

  const roomId = (req.nextUrl.searchParams.get('roomId') || '').slice(0, 120);
  const sinceRaw = Number(req.nextUrl.searchParams.get('since') || '0');
  const since = Number.isFinite(sinceRaw) && sinceRaw >= 0 ? sinceRaw : 0;
  if (!roomId) return notAMember();

  const me = await membershipOf(roomId, userId);
  if (!me) return notAMember();

  // A member reads from where they SAT DOWN, never from before it. `since`
  // is a client-supplied cursor, so a guest could otherwise ask for
  // everything after seq 0 and replay the host's session from before the
  // invitation — including whatever a previous guest had said in it.
  const floor = Math.max(since, me.joinedSeq);

  const [events, present] = await Promise.all([
    eventsSince(roomId, floor),
    membersOf(roomId),
  ]);

  return NextResponse.json({
    cursor: events.length ? events[events.length - 1].seq : floor,
    events: events.map((e) => ({
      id: e.id,
      at: e.createdAt,
      kind: e.kind,
      seq: e.seq,
      // The author is reported from the row the server wrote, not from
      // anything the sender claimed.
      by: { id: e.userId, name: nameOf(present, e.userId), seat: seatOf(present, e.userId) },
      ...e.payload,
    })),
    present: present.map((m) => ({ id: m.userId, name: m.displayName, seat: m.seat })),
    me: { id: userId, seat: me.seat },
  });
}

function nameOf(present: { userId: string; displayName: string }[], id: string): string {
  return present.find((m) => m.userId === id)?.displayName ?? 'Someone';
}
function seatOf(
  present: { userId: string; seat: 'host' | 'guest' }[],
  id: string
): 'host' | 'guest' {
  return present.find((m) => m.userId === id)?.seat ?? 'guest';
}

export async function POST(req: NextRequest) {
  // Parked until it ships — see lib/rooms-flag.ts.
  if (!roomsEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'room');
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const roomId = typeof body?.roomId === 'string' ? body.roomId.slice(0, 120) : '';
  if (!roomId) return notAMember();

  const me = await membershipOf(roomId, userId);
  if (!me) return notAMember();

  const all: unknown[] = Array.isArray(body?.events) ? body.events : [];
  const incoming = all.slice(0, MAX_BATCH);
  const idOf = (raw: unknown) =>
    raw && typeof raw === 'object' && typeof (raw as { id?: unknown }).id === 'string' ? ((raw as { id: string }).id).slice(0, 80) : '';
  // past the batch limit: not taken, and said so
  const dropped: string[] = all.slice(MAX_BATCH).map(idOf).filter(Boolean);

  // A bound on the whole batch, not just its length. sanitizeEvent caps each
  // FIELD, but a member could still post MAX_BATCH events each carrying a
  // map of thousands of nodes — every one of them individually within its
  // limit. The room is two people talking; this is far above anything that
  // exchange produces and far below anything worth storing by accident.
  const approxBytes = JSON.stringify(incoming).length;
  if (approxBytes > MAX_BATCH_BYTES) {
    return NextResponse.json({ error: 'That is too much at once.', size: approxBytes, limit: MAX_BATCH_BYTES }, { status: 413 });
  }
  const now = Date.now();
  let written = 0;
  const failed: string[] = [];

  for (const raw of incoming) {
    // Same sanitiser the wire always used — a node through the map
    // sanitiser, an author through the author check — so an event gets no
    // weaker a check for arriving over HTTPS than it did over a socket.
    // The author is then OVERWRITTEN with the session user: a client may
    // describe what happened, never who did it.
    const ev = sanitizeEvent({
      ...(raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}),
      by: { id: userId, name: me.displayName, seat: me.seat },
    });
    if (!ev) {
      const rid = idOf(raw);
      if (rid) dropped.push(rid);
      continue;
    }

    // A `hello` never carries a session any more. The room's starting point
    // lives on the room row (logos_rooms.seed_session), captured once at
    // creation and handed to each joiner by /join. Sent as an event it was
    // invisible to anyone who joined after it — a member reads the log only
    // from where they sat down — and a hello re-sent later carried the
    // MERGED session, storing one person's words in a row attributed to the
    // other. Dropping it here closes both.
    if (ev.kind === 'hello') delete (ev as { session?: unknown }).session;
    const { id, kind, at: _at, by: _by, ...payload } = ev as unknown as Record<
      string,
      unknown
    > & { id: string; kind: string };
    const ok = await appendEvent(
      roomId,
      userId,
      { id, kind, payload: payload as Record<string, unknown> },
      now
    );
    if (ok) written++;
    else failed.push(id);
  }

  if (failed.length) {
    // the store, not the events: worth sending again, and a repeat of the
    // ones that did land is forgiven by their ids
    return NextResponse.json({ error: 'That could not be saved just now.', written, failed, ...(dropped.length ? { dropped } : {}) }, { status: 503 });
  }
  return NextResponse.json({ ok: true, written, ...(dropped.length ? { dropped } : {}) });
}
