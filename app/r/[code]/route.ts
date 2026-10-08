// app/r/[code]/route.ts
// GET /r/<code> — a friend's referral link.
//
// It remembers who sent it (an httpOnly cookie holding the code and when the
// link was opened — first link wins) and sends the visitor to create an
// account. Nothing is granted here: the friend's seven days are given when the
// new account first loads Socria (/api/rewards), after the server has checked
// that it really is a new account and not the sender's own.
//
// The sign-up page says "a friend invited you — seven days" only for a code
// somebody holds. A mistyped link, or one read while the rewards tables are
// missing, lands on the ordinary sign-up page: no promise nothing will honour.
//
// Someone already signed in is simply taken to Socria: a link cannot make an
// existing account "new".

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { rewardsConfig } from '@/lib/rewards/rewards-config';
import { normalizeReferralCode } from '@/lib/rewards/referral-rule';
import { supabaseRewardsStore } from '@/lib/rewards/supabase-rewards-store';
import { setRefCookie } from '@/lib/rewards/rewards-server';
import { trackServer } from '@/lib/analytics-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  let userId: string | null = null;
  try {
    userId = auth().userId;
  } catch {
    // no identity provider on this deployment: a visitor, then
  }
  if (userId) return NextResponse.redirect(new URL('/chat', req.url));

  const cfg = rewardsConfig();
  const code = normalizeReferralCode(params.code);
  let held = false;
  if (code && cfg.enabled) {
    try {
      // only a code somebody holds is remembered — a mistyped link leaves nothing behind
      held = !!(await supabaseRewardsStore().ownerOfCode(code));
    } catch {
      // no rewards tables yet: the link still lands somewhere sensible
    }
  }

  const dest = new URL('/sign-up', req.url);
  if (held) dest.searchParams.set('invited', '1');
  const res = NextResponse.redirect(dest);
  if (held && code) {
    try {
      if (setRefCookie(req, res, code, 'link', cfg)) await trackServer('rewards_referral_link_opened', { surface: 'link' }, req);
    } catch {
      // the visitor still reaches the sign-up page
    }
  }
  return res;
}
