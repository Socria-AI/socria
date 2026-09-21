// app/api/logos/room/route.ts
// POST → open a shared room and seat the caller as host.
//
// Requires a real Clerk session. There is no access-code path here: a room
// holds two people's thinking and is attributed per person, so "who are you"
// has to have a real answer.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { createRoom, nameFor } from '@/lib/logos-rooms-server';
import { sanitizeSeedSession } from '@/lib/logos-rooms-shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  // The host may open the room around the line of thinking they are already
  // in. Sanitised like any stored session, and captured once — from here on
  // the room's own event log is the record.
  const body = await req.json().catch(() => null);
  const seed = body?.session ? sanitizeSeedSession(body.session) : null;

  const room = await createRoom(userId, await nameFor(userId), Date.now(), seed);
  if (!room) {
    return NextResponse.json({ error: 'Could not open a room.' }, { status: 500 });
  }
  return NextResponse.json({
    room: { id: room.id, code: room.code, since: 0, seed: room.seedSession },
    me: { id: userId, seat: 'host' },
    present: [{ id: userId, name: await nameFor(userId), seat: 'host' }],
  });
}
