// app/api/access/gate/route.ts
// POST /api/access/gate { code } → { gate, label } — what an access code opens.
//
// Checked here so the codes never ship to the browser. Signed in (or holding
// the site's unlock grant) and rate-limited, so it cannot be used to guess.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { GATE_LABEL } from '@/lib/feature-gates';
import { gateForCode } from '@/lib/feature-gates-server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { mayUse } from '@/lib/route-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId && !mayUse(req, userId)) return NextResponse.json({ error: 'Sign in to use an access code.' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;
  const body = await req.json().catch(() => null);
  const gate = gateForCode(body?.code);
  if (!gate) return NextResponse.json({ error: 'That code isn’t one we recognise.' }, { status: 400 });
  return NextResponse.json({ gate, label: GATE_LABEL[gate] });
}
