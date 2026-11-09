// GET /api/logos/usage?chat=<sessionId>
//
// What this person has spent, so the UI can say what is left before they run
// into it. Read-only and cheap — one query for the month, the day and the
// conversation together, and one for the week's tokens.
//
// The numbers are the server's, which is the point: the client draws the
// panel from the same counts the routes enforce against, so what it shows and
// what happens cannot drift apart.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { resolvePlanForRequest } from '@/lib/socria-one-server';
import { COUNTERS, limitsFor, type Counter } from '@/lib/entitlements';
import { readAllUsage } from '@/lib/usage';
import { trialStateFor } from '@/lib/sleep-server';

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

  // the seven-day trial (lib/trial.ts): where it stands — not begun, running (which day, how many left,
  // when it ends) or over — and today's tokens, as Sleep Mode's state (`sleep`, period 'day'), so the
  // screen counts down to 00:00 UTC. Null for Socria One and for a guest, who are not counted; left out
  // when the store cannot be read, so the app keeps what it last knew rather than a number nobody counted.
  const trial = await trialStateFor(userId ?? null, plan);

  // an ended trial is not resting until 00:00 UTC — it is over, and the app says so instead (no `sleep`)
  return NextResponse.json({ plan, counters, limits, ...(trial === undefined ? {} : { trial, sleep: trial && trial.status !== 'ended' ? trial.today : null }) });
}
