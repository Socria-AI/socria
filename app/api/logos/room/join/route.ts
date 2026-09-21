// app/api/logos/room/join/route.ts
// POST { code } → take a seat in an open room.
//
// This is where the two-person limit is actually enforced. It used to be a
// constant in React state, which meant it bound only the people who ran our
// code — a silent third subscriber was invisible and unstopped. Capacity is
// now decided by the database (see joinRoom), and a room a person is not a
// member of returns nothing to them anywhere else in this API.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { joinRoom, membersOf, nameFor, normalizeRoomCode, roomTail } from '@/lib/logos-rooms-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // A code can only be tried through this route, signed in, on the shared
  // rate-limit budget — which is what makes an eight-character code enough.
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const code = normalizeRoomCode(body?.code);
  if (!code) return NextResponse.json({ error: 'That is not a room code.' }, { status: 400 });

  const result = await joinRoom(code, userId, await nameFor(userId), Date.now());
  if (!result.ok) {
    // "Not found" and "closed" are one answer on purpose: a signed-in caller
    // should not be able to map which codes exist.
    // One answer for "no such room", "closed" and "already full". The comment
    // above claimed a signed-in caller should not be able to map which codes
    // exist, and then a distinct 409 told them exactly that. The copy names
    // both possibilities so the person is not misled.
    return NextResponse.json(
      { error: 'No open room with that code, or it already has two people in it.' },
      { status: 404 }
    );
  }
  // Where the room is up to, so a joiner starts at the tail rather than
  // replaying every event since it opened.
  const tail = await roomTail(result.room.id);
  const present = await membersOf(result.room.id);
  return NextResponse.json({
    room: {
      id: result.room.id,
      code: result.room.code,
      since: tail,
      // The host's starting point, so a guest opens into the conversation
      // they were invited to rather than a blank page.
      seed: result.room.seedSession,
    },
    me: { id: userId, seat: result.member.seat },
    present: present.map((m) => ({ id: m.userId, name: m.displayName, seat: m.seat })),
  });
}
