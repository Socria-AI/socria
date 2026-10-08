// app/api/rewards/invite/route.ts
// POST {room} | {token} | {invite} | {code} — a signed-out person opened a
// Think Together invitation.
//
// If they go on to make an account, the person who invited them brought them
// to Socria exactly as a referral link would have, so the inviter is
// remembered as their referrer (an httpOnly cookie; first link wins). Nothing
// is granted here and nothing about the invitation changes: it opens, and the
// collaboration's own permissions decide everything about it, as before.
//
// Signed in, this does nothing — an existing account is not a new friend.
// The answer never says who the inviter is.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { rewardsConfig } from '@/lib/rewards/rewards-config';
import { rememberInviter } from '@/lib/rewards/rewards-server';
import { inviterOf } from '@/lib/share/server';
import { cleanToken, normalizeCode } from '@/lib/share/roles';
import { normalizeRoomCode, openRoomByCode } from '@/lib/logos-rooms-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let userId: string | null = null;
  try {
    userId = auth().userId;
  } catch {}
  const res = NextResponse.json({ ok: true });
  if (userId || !rewardsConfig().enabled) return res;
  const limited = await enforceRateLimit(req, null, 'aux');
  if (limited) return limited;
  const body = await req.json().catch(() => null);
  let inviter: string | null = null;
  try {
    const room = normalizeRoomCode(body?.room);
    if (room) inviter = (await openRoomByCode(room))?.hostUserId ?? null;
    else {
      inviter = await inviterOf({
        token: cleanToken(body?.token),
        invite: cleanToken(body?.invite),
        code: normalizeCode(body?.code),
      });
    }
  } catch {
    inviter = null;
  }
  await rememberInviter(req, res, inviter);
  return res;
}
