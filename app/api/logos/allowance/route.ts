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
//   { counter: 'nodes', n?: number }  →  200 { ok: true, used, limit }
//                                      →  402 { error, upgrade: 'nodes', used, limit }

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { resolvePlanForRequest } from '@/lib/socria-one-server';
import { boundaryNote } from '@/lib/entitlements';
import { consume } from '@/lib/quota';

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
  const took = await consume(userId, plan, 'nodes', n);
  if (!took.ok) return NextResponse.json({ error: boundaryNote('nodes'), upgrade: 'nodes', used: took.used, limit: took.limit }, { status: 402 });
  return NextResponse.json({ ok: true, used: took.used, limit: took.limit });
}
