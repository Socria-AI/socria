// app/api/logos/room/leave/route.ts
// POST { roomId } → give up your seat.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { leaveRoom, membershipOf } from '@/lib/logos-rooms-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const roomId = typeof body?.roomId === 'string' ? body.roomId.slice(0, 120) : '';
  if (!roomId) return NextResponse.json({ error: 'Which room?' }, { status: 400 });

  // Leaving someone else's room is not a thing: only a member may leave, and
  // only their own seat.
  if (!(await membershipOf(roomId, userId))) {
    return NextResponse.json({ ok: true });
  }
  await leaveRoom(roomId, userId, Date.now());
  return NextResponse.json({ ok: true });
}
