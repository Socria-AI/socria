// app/api/share/accept/route.ts
// POST {token} | {code} | {invite} → join what it opens, at its role.
//
// A signed-in account is required: a share is a list of people, and someone
// without an account is nobody the owner can see, change or remove. Joining
// is free on every plan. A link or code that was reset or turned off reads as
// gone — the same answer whether it never existed or was revoked a minute ago.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { cleanToken, landing, normalizeCode } from '@/lib/share/roles';
import { ShareError, acceptCode, acceptInvite, acceptLink, type Joined } from '@/lib/share/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Sign in to open this.', signIn: true }, { status: 401 });
  // tight: a code is eight characters, and guessing is not a feature
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;
  const body = await req.json().catch(() => null);
  try {
    let joined: Joined;
    const token = cleanToken(body?.token);
    const inviteTok = cleanToken(body?.invite);
    const code = normalizeCode(body?.code);
    if (token) joined = await acceptLink(userId, token);
    else if (inviteTok) joined = await acceptInvite(userId, inviteTok);
    else if (code) joined = await acceptCode(userId, code);
    else return NextResponse.json({ error: 'That is not an invitation Socria made.' }, { status: 400 });
    return NextResponse.json({ ...joined, open: landing(joined) });
  } catch (e) {
    if (e instanceof ShareError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[share/accept] failed', e);
    return NextResponse.json({ error: 'That could not be opened just now.' }, { status: 500 });
  }
}
