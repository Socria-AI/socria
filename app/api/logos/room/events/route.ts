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
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import {
  appendEvent,
  eventsSince,
  membersOf,
  membershipOf,
} from '@/lib/logos-rooms-server';
import { sanitizeEvent } from '@/lib/collab-transport';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Most events a client may post in one request. */
const MAX_BATCH = 20;

/** And how much they may weigh together, serialized. */
const MAX_BATCH_BYTES = 512 * 1024;

function notAMember(): NextResponse {
  // Deliberately indistinguishable from "no such room": a member of no room
  // learns nothing about which rooms exist.
  return NextResponse.json({ error: 'No such room.' }, { status: 404 });
}

export async function GET(req: NextRequest) {
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
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'room');
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const roomId = typeof body?.roomId === 'string' ? body.roomId.slice(0, 120) : '';
  if (!roomId) return notAMember();

  const me = await membershipOf(roomId, userId);
  if (!me) return notAMember();

  const incoming = Array.isArray(body?.events) ? body.events.slice(0, MAX_BATCH) : [];

  // A bound on the whole batch, not just its length. sanitizeEvent caps each
  // FIELD, but a member could still post MAX_BATCH events each carrying a
  // map of thousands of nodes — every one of them individually within its
  // limit. The room is two people talking; this is far above anything that
  // exchange produces and far below anything worth storing by accident.
  const approxBytes = JSON.stringify(incoming).length;
  if (approxBytes > MAX_BATCH_BYTES) {
    return NextResponse.json({ error: 'That is too much at once.' }, { status: 413 });
  }
  const now = Date.now();
  let written = 0;

  for (const raw of incoming) {
    // Same sanitiser the wire always used — a node through the map
    // sanitiser, an author through the author check — so an event gets no
    // weaker a check for arriving over HTTPS than it did over a socket.
    // The author is then OVERWRITTEN with the session user: a client may
    // describe what happened, never who did it.
    const ev = sanitizeEvent({
      ...raw,
      by: { id: userId, name: me.displayName, seat: me.seat },
    });
    if (!ev) continue;

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
  }

  return NextResponse.json({ ok: true, written });
}
