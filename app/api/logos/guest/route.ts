// app/api/logos/guest/route.ts — a guest claims their one line of thinking.
//
// POST { sessionId } → { ok: true } and a signed httpOnly cookie naming that
// line of thinking (lib/guest-pass.ts), when it is the guest's first or the one
// they already have; { ok: false, guestLimit: true } with a 403 when they
// already have another; { ok: false } with a 503 when this deployment cannot
// sign a pass. Somebody signed in, or holding the access key, needs no pass:
// { ok: true, guest: false }.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { mayUse } from '@/lib/route-guard';
import { GUEST_COOKIE, GUEST_COOKIE_PATH, GUEST_LIMIT, GUEST_TTL_MS, claimGuest } from '@/lib/guest-pass';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let userId: string | null = null;
  try {
    userId = auth().userId ?? null;
  } catch {
    userId = null;
  }
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;
  if (userId || mayUse(req, userId)) return NextResponse.json({ ok: true, guest: false });

  const body = await req.json().catch(() => null);
  const claim = claimGuest(req.cookies.get(GUEST_COOKIE)?.value, body?.sessionId, Date.now());
  if (!claim.ok) {
    if (claim.why === 'other-session') return NextResponse.json({ ok: false, guestLimit: true, error: GUEST_LIMIT }, { status: 403 });
    if (claim.why === 'unavailable') return NextResponse.json({ ok: false, error: 'Sign up to use Socria.' }, { status: 503 });
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const res = NextResponse.json({ ok: true, guest: true });
  if (claim.pass) {
    res.cookies.set({
      name: GUEST_COOKIE,
      value: claim.pass,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: GUEST_COOKIE_PATH,
      maxAge: Math.floor(GUEST_TTL_MS / 1000),
    });
  }
  return res;
}
