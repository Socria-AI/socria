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
import { type Plan } from './socria-one';
import { requestScope } from './route-guard';
import { scopeSatisfies } from './access-codes-server';
import { isSubscribed } from './subscriptions';
import { hasAccountGrant } from './socria-one-grant';

/**
 * The answer, remembered briefly per account.
 *
 * Every gated route asks, and a Core turn now asks from three of them (the
 * chat, the thread extractor, the journey extractor). Each miss is a Supabase
 * read and — when the per-instance grant cache is cold, which on Vercel is
 * most cold starts — a Clerk call. Thirty seconds of staleness is the same
 * staleness the grant cache already accepts, and the two writers that change
 * the answer (the webhook, a redeemed code) clear it in-process so a person
 * who just paid is not told otherwise for half a minute by the instance that
 * took the payment.
 *
 * Only the ACCOUNT half is memoised. The header check below the memo is per
 * request by nature and costs nothing.
 */
const PLAN_MEMO_MS = 30_000;
const planMemo = new Map<string, { plan: Plan; at: number }>();

export function forgetPlanMemo(userId: string): void {
  planMemo.delete(userId);
}

async function accountPlan(userId: string): Promise<Plan> {
  const hit = planMemo.get(userId);
  const now = Date.now();
  if (hit && now - hit.at < PLAN_MEMO_MS) return hit.plan;
  let plan: Plan = 'free';
  if (await isSubscribed(userId)) plan = 'one';
  else if (await hasAccountGrant(userId)) plan = 'one';
  planMemo.set(userId, { plan, at: now });
  // Bounded: a long-lived instance must not grow a map of every visitor.
  if (planMemo.size > 5000) {
    const oldest = planMemo.keys().next().value;
    if (oldest !== undefined) planMemo.delete(oldest);
  }
  return plan;
}

export async function resolvePlanForRequest(
  req: NextRequest,
  userId: string | null
): Promise<Plan> {
  if (userId && (await accountPlan(userId)) === 'one') return 'one';

  const allow = (process.env.SOCRIA_ONE_USER_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (userId && allow.includes(userId)) return 'one';

  // A verified unlock grant of scope 'one'. This replaces the old
  // `x-socria-one` header, which compared a caller-supplied string against a
  // constant that shipped in the browser bundle — so reading the bundle was
  // enough to hold the paid plan for free. The grant is an httpOnly cookie
  // this server signed after checking a typed code against SOCRIA_ONE_CODE,
  // and it cannot be minted client-side.
  if (scopeSatisfies(requestScope(req), 'one')) return 'one';

  return 'free';
}
