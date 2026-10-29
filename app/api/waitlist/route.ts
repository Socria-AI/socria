// app/api/waitlist/route.ts
// POST { email } → { ok: true, already?: true } — onto the relaunch's waitlist (lib/waitlist.ts).
// { ok: false } with a 400 for something that is not an address. Rate limited
// per address, on the code field's generous budget: a room on one Wi-Fi.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { cleanEmail, joinWaitlist } from '@/lib/waitlist';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function signedIn(): string | null {
  try {
    return auth().userId ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, signedIn(), 'enter');
  if (limited) return limited;
  const body = (await req.json().catch(() => null)) as { email?: unknown } | null;
  const email = cleanEmail(body?.email);
  if (!email) return NextResponse.json({ ok: false }, { status: 400 });
  try {
    const r = await joinWaitlist(email);
    return NextResponse.json(r === 'already' ? { ok: true, already: true } : { ok: true });
  } catch (e) {
    console.error('[waitlist] could not keep an address', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
