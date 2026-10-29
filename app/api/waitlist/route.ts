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
  // a plain form (no JavaScript) is answered with a redirect back to the page
  const form = !(req.headers.get('content-type') ?? '').includes('application/json');
  const back = () => NextResponse.redirect(new URL('/', req.url), 303);
  let raw: unknown = null;
  try {
    raw = form ? (await req.formData()).get('email') : ((await req.json()) as { email?: unknown } | null)?.email;
  } catch {
    raw = null;
  }
  const email = cleanEmail(raw);
  if (!email) return form ? back() : NextResponse.json({ ok: false }, { status: 400 });
  try {
    const r = await joinWaitlist(email);
    if (form) return back();
    return NextResponse.json(r === 'already' ? { ok: true, already: true } : { ok: true });
  } catch (e) {
    console.error('[waitlist] could not keep an address', e instanceof Error ? e.message : e);
    return form ? back() : NextResponse.json({ ok: false }, { status: 503 });
  }
}
