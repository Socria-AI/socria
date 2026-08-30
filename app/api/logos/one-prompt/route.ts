// app/api/logos/one-prompt/route.ts
//
// GET  → { dismissals, lastDismissedAt, known } — how often we have already
//         asked this account, so a cooldown survives a new device.
// POST → records one dismissal.
//
// Nothing here decides whether to show anything. The rules live in
// lib/one-prompt.ts and run on the client, where the rest of the inputs
// (what is on screen, what has been shown this session) already are. This
// route only remembers the part that has to outlive the browser.
//
// Signed out there is nothing to remember against, so it answers `known:
// false` and the client uses its own memory. Same for a deployment that has
// not run the migration.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { resolvePlanForRequest } from '@/lib/socria-one-server';
import { readPromptState, recordDismissal } from '@/lib/one-prompt-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { userId } = auth();
  const plan = await resolvePlanForRequest(req, userId);

  // A member is never prompted, so there is nothing to compute. Answering
  // this way also means the client cannot show a prompt while waiting for
  // this call to land.
  if (plan === 'one') {
    return NextResponse.json({ plan, known: true, dismissals: 0, lastDismissedAt: 0 });
  }
  if (!userId) {
    return NextResponse.json({ plan, known: false, dismissals: 0, lastDismissedAt: 0 });
  }

  const state = await readPromptState(userId);
  return NextResponse.json({
    plan,
    known: state !== null,
    dismissals: state?.dismissals ?? 0,
    lastDismissedAt: state?.lastDismissedAt ?? 0,
  });
}

export async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId) {
    // Nothing to write. The browser still remembers locally.
    return NextResponse.json({ known: false, dismissals: 0 });
  }
  const plan = await resolvePlanForRequest(req, userId);
  if (plan === 'one') return NextResponse.json({ known: true, dismissals: 0 });

  const at = Date.now();
  const n = await recordDismissal(userId, at);
  return NextResponse.json({
    known: n !== null,
    dismissals: n ?? 0,
    lastDismissedAt: at,
  });
}
