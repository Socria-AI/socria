// app/api/logos-5-internal/route.ts — the code for the internal architecture page.
//
// POST { code } → { ok: true } and a signed httpOnly cookie scoped to
// /logos-5-internal, when the code is the new Socria's (gateForCode), or
// { ok: false } with a 400 otherwise — the same answer whether the code was
// wrong or this deployment cannot sign a pass (lib/internal-pass.ts).
//
// A place the new Socria's code can be guessed against, so it shares the
// small 'code' rate-limit pool with the developer dashboard's codes.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { gateForCode } from '@/lib/feature-gates-server';
import { INTERNAL_PASS_COOKIE, INTERNAL_PASS_TTL_MS, issueInternalPass } from '@/lib/internal-pass';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let userId: string | null = null;
  try {
    userId = auth().userId ?? null;
  } catch {
    userId = null;
  }
  const limited = await enforceRateLimit(req, userId, 'code');
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const pass = gateForCode(body?.code) === 'socria' ? issueInternalPass(Date.now()) : null;
  if (!pass) return NextResponse.json({ ok: false }, { status: 400 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: INTERNAL_PASS_COOKIE,
    value: pass,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/logos-5-internal',
    maxAge: Math.floor(INTERNAL_PASS_TTL_MS / 1000),
  });
  return res;
}
