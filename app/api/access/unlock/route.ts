// app/api/access/unlock/route.ts
// POST { code } → sets a signed, httpOnly unlock cookie when the code matches.
// DELETE        → clears it.
//
// This route exists so the client never has to hold a code in order to prove
// one. The person types it, the browser forwards it once, the server compares
// it against the environment and hands back a signed grant. What the browser
// keeps afterwards is the grant, not the code — and the grant is httpOnly, so
// script on the page cannot read it either.
//
// It is the only surface a code can be guessed against, so it is rate
// limited on the same 'aux' budget as the rest, per IP for signed-out
// callers. With no code configured it always refuses, which is the default.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import {
  ACCESS_COOKIE,
  GRANT_TTL_MS,
  accessCodesConfigured,
  issueGrant,
  scopeForCode,
} from '@/lib/access-codes-server';

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
  const userId = signedIn();
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  // Nothing configured means no code can be right. Said the same way as a
  // wrong code, so the response never reveals whether a gate exists.
  if (!accessCodesConfigured()) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const scope = scopeForCode(body?.code);
  if (!scope) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const value = issueGrant(scope, Date.now());
  if (!value) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true, scope });
  res.cookies.set({
    name: ACCESS_COOKIE,
    value,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.floor(GRANT_TTL_MS / 1000),
  });
  return res;
}

export async function DELETE(_req: NextRequest) {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: ACCESS_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return res;
}
