// app/api/rewards/route.ts
// POST → the person's Socria Rewards: the 5-Node Challenge, their referral
// link, promotional time, and what each reward did.
//
// POST, not GET, because asking is also when things are DECIDED — on the
// server, from what the server holds, never from anything in the body (there
// is no body):
//
//   - a referral link this browser opened before the account existed is
//     attributed (once; the cookie is cleared whatever the answer);
//   - if this person was referred and has now become active, the person who
//     invited them is rewarded (once);
//   - the 5-Node Challenge is checked against their stored Logos maps, and
//     granted if they qualify (once);
//   - promotional time is resolved: banked time starts when their own access
//     has ended, running time pauses while they pay.
//
// Every one of those is idempotent, so this is safe to call as often as the
// surfaces like; it is rate-limited like the other auxiliary routes.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { rewardsConfig } from '@/lib/rewards/rewards-config';
import { attributeReferral, rewardsStatus } from '@/lib/rewards/rewards-service';
import { daysOf } from '@/lib/rewards/promo-engine';
import { RewardsUnavailable } from '@/lib/rewards/supabase-rewards-store';
import {
  clearRefCookie,
  emailsOf,
  identityFacts,
  loadActivity,
  loadChallengeSessions,
  readRefCookie,
  rewardsDeps,
} from '@/lib/rewards/rewards-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Sign in to see your rewards.' }, { status: 401 });
  const cfg = rewardsConfig();
  if (!cfg.enabled) return NextResponse.json({ enabled: false });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  const deps = rewardsDeps(req);
  try {
    // A friend's link, opened before this account existed.
    const cookie = readRefCookie(req, cfg);
    let invited: { ok: true; days: number } | { ok: false; reason: string } | null = null;
    let decided = false;
    if (cookie) {
      const facts = await identityFacts(userId);
      if (facts) {
        const r = await attributeReferral(deps, {
          userId,
          cookie,
          via: cookie.via ?? 'link',
          referred: facts,
          referrerEmails: emailsOf,
        });
        invited = r.ok ? { ok: true, days: daysOf(r.grant.appliedMs, cfg.dayMs) } : { ok: false, reason: r.reason };
        decided = true;
      }
    }

    const status = await rewardsStatus(deps, userId, {
      challengeSessions: () => loadChallengeSessions(userId, cfg),
      activity: () => loadActivity(userId),
    });
    const res = NextResponse.json({
      ...status,
      link: `${req.nextUrl.origin}/r/${status.referral.code}`,
      ...(invited ? { invited } : {}),
    });
    if (decided) clearRefCookie(res);
    return res;
  } catch (e) {
    if (e instanceof RewardsUnavailable) return NextResponse.json({ enabled: false, unavailable: true });
    console.error('[rewards] failed', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Rewards could not be loaded just now.' }, { status: 500 });
  }
}
