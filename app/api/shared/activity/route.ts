// app/api/shared/activity/route.ts
// GET ?type=&id= → what changed on a shared thing, who did it, and when —
//                  newest first. Anyone with access may read it.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { cleanType } from '@/lib/share/roles';
import { activity } from '@/lib/share/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'room');
  if (limited) return limited;
  const type = cleanType(req.nextUrl.searchParams.get('type'));
  const id = req.nextUrl.searchParams.get('id');
  if (!type || !id || !/^[A-Za-z0-9_-]{1,120}$/.test(id)) return NextResponse.json({ error: 'Nothing here.' }, { status: 400 });
  const list = await activity(userId, type, id).catch(() => null);
  if (!list) return NextResponse.json({ error: 'No such thing.' }, { status: 404 });
  return NextResponse.json({ activity: list });
}
