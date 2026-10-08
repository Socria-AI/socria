// app/api/shared/presence/route.ts
// POST {type, id, cursor?, leave?} → I am here (and my pointer is here);
//                                    answers with everyone else who is.
//
// Think Together's heartbeat. Every few seconds while a shared thing is open.
// Anyone with access may be present — a viewer being seen is not a viewer
// editing — and a person without access gets the same 404 as a wrong id.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { cleanType } from '@/lib/share/roles';
import { ShareError } from '@/lib/share/server';
import { heartbeat, leave } from '@/lib/share/collab';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'room');
  if (limited) return limited;
  const b = await req.json().catch(() => null);
  const type = cleanType(b?.type);
  const id = typeof b?.id === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(b.id) ? b.id : null;
  if (!type || !id) return NextResponse.json({ error: 'Nothing here.' }, { status: 400 });
  try {
    if (b?.leave === true) {
      await leave(userId, type, id);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json(await heartbeat(userId, type, id, b?.cursor));
  } catch (e) {
    if (e instanceof ShareError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[shared/presence] failed', e);
    return NextResponse.json({ error: 'Presence is unavailable just now.' }, { status: 500 });
  }
}
