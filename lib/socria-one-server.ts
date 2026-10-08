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
//
// And one layer over them: PROMOTIONAL Socria One from Socria Rewards (the
// 5-Node Challenge, Give 7 / Get 7 — lib/rewards/). It is asked only when none
// of the three holds, so it can never stand in front of paid access, and it
// is reported separately (resolveBasePlanForRequest), because a person on a
// reward has not bought anything: checkout must still sell to them, and
// "Manage membership" has nothing to manage.

import type { NextRequest } from 'next/server';
import { type Plan } from './socria-one';
import { requestScope } from './route-guard';
import { scopeSatisfies } from './access-codes-server';
import { entitles, isSubscribed, readSubscription } from './subscriptions';
import { accountGrantKnown, hasAccountGrant } from './socria-one-grant';
import { promoActiveNow } from './rewards/promo-access';

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
const promoMemo = new Map<string, { on: boolean; at: number }>();

export function forgetPlanMemo(userId: string): void {
  planMemo.delete(userId);
  promoMemo.delete(userId);
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

function allowlisted(userId: string): boolean {
  return (process.env.SOCRIA_ONE_USER_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(userId);
}

/**
 * What the person holds WITHOUT promotional time: paid, complimentary,
 * student, allowlisted or a typed code. Checkout asks this — somebody on a
 * reward has not bought Socria One and must still be able to.
 */
export async function resolveBasePlanForRequest(
  req: NextRequest,
  userId: string | null
): Promise<Plan> {
  if (userId && (await accountPlan(userId)) === 'one') return 'one';
  if (userId && allowlisted(userId)) return 'one';

  // A verified unlock grant of scope 'one'. This replaces the old
  // `x-socria-one` header, which compared a caller-supplied string against a
  // constant that shipped in the browser bundle — so reading the bundle was
  // enough to hold the paid plan for free. The grant is an httpOnly cookie
  // this server signed after checking a typed code against SOCRIA_ONE_CODE,
  // and it cannot be minted client-side.
  if (scopeSatisfies(requestScope(req), 'one')) return 'one';

  return 'free';
}

/** Promotional Socria One running right now — remembered as briefly as the plan is. */
async function promoOn(userId: string): Promise<boolean> {
  const hit = promoMemo.get(userId);
  const now = Date.now();
  if (hit && now - hit.at < PLAN_MEMO_MS) return hit.on;
  const on = await promoActiveNow(userId);
  promoMemo.set(userId, { on, at: now });
  if (promoMemo.size > 5000) {
    const oldest = promoMemo.keys().next().value;
    if (oldest !== undefined) promoMemo.delete(oldest);
  }
  return on;
}

/**
 * The plan every gated route clamps against: what they hold, and — only when
 * that is nothing — promotional Socria One from a reward.
 */
export async function resolvePlanForRequest(
  req: NextRequest,
  userId: string | null
): Promise<Plan> {
  const base = await resolveBasePlanForRequest(req, userId);
  if (base === 'one' || !userId) return base;
  return (await promoOn(userId)) ? 'one' : 'free';
}

/**
 * For Socria Rewards: does this account hold Socria One other than by
 * promotion — and, when that cannot be told for certain, the answer that
 * loses nobody anything.
 *
 * A reward to someone who already holds Socria One is BANKED, not started;
 * banked time starts only when their own access has ended. So "I could not
 * tell" must answer YES: the worst that does is keep a reward in the bank a
 * little longer, where answering no could start someone's banked days while
 * they are in fact paying. Account-level only — the typed-code cookie belongs
 * to a browser, not to the person.
 */
export async function baseEntitledForRewards(userId: string): Promise<boolean> {
  if (allowlisted(userId)) return true;
  const sub = await readSubscription(userId);
  if (sub.ok && entitles(sub.row)) return true;
  const grant = await accountGrantKnown(userId);
  if (grant === true) return true;
  return !sub.ok || grant === null;
}
