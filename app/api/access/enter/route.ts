// app/api/access/enter/route.ts
// POST { code } → the relaunch's entry (lib/takeover.ts): a signed, httpOnly
//                 cookie and { ok: true } when the code is right; { ok: false }
//                 with a 400 when it is not.
//      A form posted without JavaScript is answered with a redirect instead —
//      into Logos 5, or back to the page.
// DELETE        → leaves: the cookie is cleared.
//
// The code is compared here and nowhere else. The browser forwards what was
// typed, once, and keeps only the cookie — which script on the page cannot
// read. Tries are rate limited per address ('enter'), generously, because a
// whole room on one campus Wi-Fi may be typing it at the same moment. With
// the campaign off, this route is not there.

import { NextRequest, NextResponse } from 'next/server';
import { webcrypto } from 'node:crypto';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { ENTRY_COOKIE, ENTRY_TTL_S, codeMatches, issueEntry, takeoverEnv, takeoverOn } from '@/lib/takeover';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const subtle = webcrypto.subtle as unknown as SubtleCrypto;

function signedIn(): string | null {
  try {
    return auth().userId ?? null;
  } catch {
    return null;
  }
}

/** A form post's answer: somewhere on this site, as a GET. */
const back = (req: NextRequest, to: '/' | '/chat') => NextResponse.redirect(new URL(to, req.url), 303);

function cookie(res: NextResponse, value: string, maxAge: number): NextResponse {
  res.cookies.set({
    name: ENTRY_COOKIE,
    value,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  });
  return res;
}

export async function POST(req: NextRequest) {
  const env = takeoverEnv();
  if (!takeoverOn(env)) return NextResponse.json({ ok: false }, { status: 404 });
  const form = !(req.headers.get('content-type') ?? '').includes('application/json');

  const limited = await enforceRateLimit(req, signedIn(), 'enter');
  if (limited) return form ? back(req, '/') : limited;

  let typed: unknown = null;
  try {
    typed = form ? (await req.formData()).get('code') : ((await req.json()) as { code?: unknown } | null)?.code;
  } catch {
    typed = null;
  }
  if (!(await codeMatches(subtle, typed, env))) {
    return form ? back(req, '/') : NextResponse.json({ ok: false }, { status: 400 });
  }

  // Right code, but nothing to sign the entry with: the deployment is missing
  // its secret. Said as closed rather than wrong, because it is not wrong.
  const value = await issueEntry(subtle, env, Date.now());
  if (!value) return form ? back(req, '/') : NextResponse.json({ ok: false, closed: true }, { status: 503 });

  return cookie(form ? back(req, '/chat') : NextResponse.json({ ok: true }), value, ENTRY_TTL_S);
}

export async function DELETE() {
  return cookie(NextResponse.json({ ok: true }), '', 0);
}
