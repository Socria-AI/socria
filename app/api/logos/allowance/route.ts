// POST /api/logos/allowance — take from the free plan's allowance for something
// made in the browser rather than by a route: nodes added to a Logic Map by
// hand (lib/entitlements.ts `nodes`).
//
// The map route counts the nodes Socria draws; a node someone adds by hand
// never passes through it, so the page asks here first and adds the node only
// when the answer is yes. Socria One is never counted. Signed out there is no
// account to count against (a guest's one map is local), so it is refused like
// every account route.
//
// A map BEGUN by hand — the first cards of a conversation with no map yet —
// is one of the month's Logic Maps as well, claimed for that conversation
// before its nodes are taken (the server decides whether the conversation
// already has a map, exactly as the map route does).
//
//   { counter: 'nodes', n?, sessionId?, newMap? }  →  200 { ok: true, used, limit }
//                                                  →  402 { error, upgrade: 'maps' | 'nodes', used, limit }
//                                                  →  503 { error, unavailable: true } (usage table missing)

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { resolvePlanForRequest } from '@/lib/socria-one-server';
import { claimUnit, consume, refusal, savedMapHasNodes, unitClaimed } from '@/lib/quota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;
  const body = await req.json().catch(() => null);
  if (body?.counter !== 'nodes') return NextResponse.json({ error: 'Nothing to count.' }, { status: 400 });
  const n = Number.isInteger(body?.n) && body.n > 0 && body.n <= 20 ? (body.n as number) : 1;
  const plan = await resolvePlanForRequest(req, userId);
  const sessionId = typeof body?.sessionId === 'string' && body.sessionId.trim() ? body.sessionId.trim().slice(0, 80) : '';
  if (plan === 'free' && body?.newMap === true && sessionId) {
    const hadMap = (await unitClaimed(userId, 'maps', sessionId)) || (await savedMapHasNodes(userId, sessionId));
    if (!hadMap) {
      const claim = await claimUnit(userId, plan, 'maps', sessionId);
      if (!claim.ok) {
        const r = refusal('maps', claim);
        return NextResponse.json(r.body, { status: r.status });
      }
    }
  }
  const took = await consume(userId, plan, 'nodes', n);
  if (!took.ok) {
    const r = refusal('nodes', took);
    return NextResponse.json(r.body, { status: r.status });
  }
  return NextResponse.json({ ok: true, used: took.used, limit: took.limit });
}
