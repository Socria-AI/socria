// app/api/logos/sources/fetch/route.ts
// POST { kind, id | url } → { context: { title, ref, text } } — one chosen
// item, normalized to text. This is the only place provider bytes enter the
// system, and it happens exactly once per explicit human choice.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { ConnectError, fetchSource } from '@/lib/logos-connect';
import { SOURCE_KINDS, type SourceKind } from '@/lib/logos-sources';
import { isValidAccessKey } from '@/lib/socria-prompt';
import { enforceRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { userId } = auth();
  const keyUnlocked = isValidAccessKey(req.headers.get('x-socria-key'));
  if (!userId && !keyUnlocked) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const kind = SOURCE_KINDS.includes(body?.kind) ? (body.kind as SourceKind) : null;
  const id = typeof body?.id === 'string' ? body.id.trim().slice(0, 300) : undefined;
  const url = typeof body?.url === 'string' ? body.url.trim().slice(0, 2000) : undefined;
  if (!kind) return NextResponse.json({ error: 'Unknown source.' }, { status: 400 });

  try {
    const context = await fetchSource(kind, { id, url });
    return NextResponse.json({ context });
  } catch (e: any) {
    if (e instanceof ConnectError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error('logos source fetch error:', e);
    return NextResponse.json({ error: 'That item could not be read.' }, { status: 502 });
  }
}
