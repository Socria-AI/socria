// app/api/ar/waitlist/route.ts
// POST { email } → { ok: true, already?: true } — onto AR Mode's early-access
// waitlist (lib/waitlist.ts, the `ar` list). Needs no account: the preview is
// shown to everybody, and so is the way to ask in. { ok: false } with a 400
// for something that is not an address, a 503 when the list cannot be kept.
// The same address twice is the same entry, kept once — the storage refuses
// the second copy, so even two requests racing cannot make a duplicate.

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
  let raw: unknown = null;
  try {
    raw = ((await req.json()) as { email?: unknown } | null)?.email;
  } catch {
    raw = null;
  }
  const email = cleanEmail(raw);
  if (!email) return NextResponse.json({ ok: false, error: 'That does not look like an email address.' }, { status: 400 });
  try {
    const r = await joinWaitlist(email, 'ar');
    return NextResponse.json(r === 'already' ? { ok: true, already: true } : { ok: true });
  } catch (e) {
    console.error('[ar-waitlist] could not keep an address', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: 'The waitlist could not be reached. Try again in a moment.' }, { status: 503 });
  }
}
