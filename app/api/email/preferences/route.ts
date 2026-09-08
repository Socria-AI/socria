// app/api/email/preferences/route.ts
// GET → { lifecycle: boolean }   whether Socria may send the occasional note.
// PUT → { lifecycle: boolean }   set it.
//
// One switch, for the signed-in person, backed by the 'unsubscribed' row in
// the lifecycle ledger — the same row the unsubscribe link writes, so the
// two never disagree about whether someone said stop.
//
// "Off" when the store cannot answer. A switch that shows "on" for a
// person whose refusal is unreadable would be showing them a promise the
// sender is not keeping; and the sender, for its part, treats silence from
// the store as a refusal (lib/lifecycle-store.ts).

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { readUnsubscribed, setUnsubscribed } from '@/lib/lifecycle-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  const unsubscribed = await readUnsubscribed(userId);
  return NextResponse.json({ lifecycle: unsubscribed === false });
}

export async function PUT(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const lifecycle = body?.lifecycle;
  if (typeof lifecycle !== 'boolean') {
    return NextResponse.json({ error: 'Say whether the notes are on or off.' }, { status: 400 });
  }

  const ok = await setUnsubscribed(userId, !lifecycle);
  if (!ok) {
    return NextResponse.json(
      { error: 'Could not save that just now. Try again in a moment.' },
      { status: 500 }
    );
  }
  return NextResponse.json({ lifecycle });
}
