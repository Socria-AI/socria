// app/api/dev/dashboard-code/route.ts — the developer dashboard's two-step code.
//
// POST { step: 1 | 2, code } → { ok: true } and a signed httpOnly cookie, or
// { ok: false } with a 400. Step 2 is only accepted beside step 1's cookie,
// and a wrong second code clears that cookie, so the person starts over
// (lib/dashboard/codes.ts). Every answer that is not a success looks the
// same, whichever step failed and whether codes are configured at all.
//
// The one place these codes can be guessed against, so it has its own small
// rate-limit pool ('code').

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { HALF_COOKIE, HALF_TTL_MS, PASS_COOKIE, PASS_TTL_MS, codeMatches, dashboardCodesConfigured, holds, issue } from '@/lib/dashboard/codes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const cookie = (name: string, value: string, ttl: number) => ({
  name,
  value,
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
  maxAge: Math.floor(ttl / 1000),
});

export async function POST(req: NextRequest) {
  let userId: string | null = null;
  try {
    userId = auth().userId ?? null;
  } catch {
    userId = null;
  }
  const limited = await enforceRateLimit(req, userId, 'code');
  if (limited) return limited;

  const no = () => NextResponse.json({ ok: false }, { status: 400 });
  if (!dashboardCodesConfigured()) return no();
  const body = await req.json().catch(() => null);
  const now = Date.now();

  if (body?.step === 1) {
    const half = codeMatches(1, body?.code) ? issue('half', now) : null;
    if (!half) return no();
    const res = NextResponse.json({ ok: true });
    res.cookies.set(cookie(HALF_COOKIE, half, HALF_TTL_MS));
    return res;
  }

  if (body?.step === 2) {
    const started = holds('half', req.cookies.get(HALF_COOKIE)?.value, now);
    const pass = started && codeMatches(2, body?.code) ? issue('pass', now) : null;
    // right or wrong, step one is used up
    const res = pass ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, again: true }, { status: 400 });
    res.cookies.set(cookie(HALF_COOKIE, '', 0));
    if (pass) res.cookies.set(cookie(PASS_COOKIE, pass, PASS_TTL_MS));
    return res;
  }

  return no();
}
