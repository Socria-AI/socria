// lib/socria-one-server.ts
//
// Who is on Socria One, decided server-side. Every gated route asks this and
// clamps against the answer; the browser is never the authority.
//
// Three ways in, in order of standing:
//
//   1. A live Stripe subscription — the real one. See lib/subscriptions.ts for
//      why a cancelled-but-paid-through month still counts.
//   2. An allowlisted user id in the environment, for the team and for support.
//   3. A typed access code, the same soft gate Core 3.1 already uses, so the
//      tier can be exercised on deployments with no billing configured.

import type { NextRequest } from 'next/server';
import { isValidOneKey, type Plan } from './socria-one';
import { isSubscribed } from './subscriptions';

export async function resolvePlanForRequest(
  req: NextRequest,
  userId: string | null
): Promise<Plan> {
  if (await isSubscribed(userId)) return 'one';

  const allow = (process.env.SOCRIA_ONE_USER_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (userId && allow.includes(userId)) return 'one';

  if (isValidOneKey(req.headers.get('x-socria-one'))) return 'one';

  return 'free';
}
