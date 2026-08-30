// GET /api/logos/usage?chat=<sessionId>
//
// What this person has spent, so the UI can say what is left before they run
// into it. Read-only and cheap — one query for the month and the conversation
// together.
//
// The numbers are the server's, which is the point: the client draws the
// panel from the same counts the routes enforce against, so what it shows and
// what happens cannot drift apart.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { resolvePlanForRequest } from '@/lib/socria-one-server';
import { COUNTERS, limitsFor, type Counter } from '@/lib/entitlements';
import { readAllUsage } from '@/lib/usage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { userId } = auth();
  const plan = await resolvePlanForRequest(req, userId);
  const limits = limitsFor(plan);
  const chatId = req.nextUrl.searchParams.get('chat');

  // Signed out there is nothing to meter against, so everything reads as
  // unspent rather than as spent — the open surfaces are bounded by the rate
  // limiter, not by this.
  const used = userId ? await readAllUsage(userId, chatId) : {};

  const counters: Record<string, { used: number; limit: number | null }> = {};
  for (const c of COUNTERS as readonly Counter[]) {
    counters[c] = { used: used[c] ?? 0, limit: limits.counters[c] };
  }

  return NextResponse.json({ plan, counters, limits });
}
