// app/api/mind/stale/route.ts
// POST → "I have looked at this, and it still holds."
//
// The one way a review mark is cleared, and it exists because nothing else may
// clear one. A claim resting on something the person changed is not wrong, it
// is unchecked, and the only party who can turn unchecked into checked is them
// (lib/workspace/impact.ts, settle). Socria clearing its own marks would make
// them decoration.
//
// Nothing about the node itself changes here: no status, no confidence, no
// provenance entry. They looked; that is not a new fact about the claim.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { clearStale, loadStale } from '@/lib/mind/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;
  return NextResponse.json({ waiting: await loadStale(userId) });
}

export async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'Which one?' }, { status: 400 });

  const ok = await clearStale(userId, id);
  if (!ok) return NextResponse.json({ error: 'Could not clear that.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
