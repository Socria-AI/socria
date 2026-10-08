// app/api/shared/route.ts
// GET → everything shared with this person: Projects and conversations, with
//       who shared each and as what. Invitations sent to an address they have
//       verified are claimed first, so an emailed invite appears the first
//       time they look — without clicking anything.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { claimInvites, sharedWithMe } from '@/lib/share/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;
  try {
    await claimInvites(userId);
    return NextResponse.json({ items: await sharedWithMe(userId) });
  } catch (e) {
    console.error('[shared] list failed', e);
    return NextResponse.json({ items: [] });
  }
}
