// app/api/cron/rewards/route.ts
// GET — the daily Socria Rewards sweep. Called by Vercel's cron (vercel.json).
//
// Rewards are decided when people use Socria (/api/rewards, the Stripe
// webhook); this only tidies what nobody's visit would:
//
//   - FINISHES grants a request started and did not complete — a ledger row
//     still 'pending' a few minutes on. Finishing is idempotent: the account
//     remembers what it applied, so nothing is ever granted twice.
//   - RESOLVES promotional windows that have ended (so the ending is reported
//     once) and banked time held for people whose own access may have ended
//     (so it can start). Whether their own access has ended is asked the
//     careful way (baseEntitledForRewards): unsure means "still held", and
//     banked time stays banked.
//
// Like the lifecycle cron it will not run without CRON_SECRET, and it answers
// with counts only — never an id.

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { rewardsConfig } from '@/lib/rewards/rewards-config';
import { reconcile, resolvePromo } from '@/lib/rewards/rewards-service';
import { rewardsDeps } from '@/lib/rewards/rewards-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** How many people one run touches, at most, per kind — each is a few reads. */
const BATCH = 200;

function authorised(req: NextRequest, secret: string): boolean {
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const a = Buffer.from(token, 'utf8');
  const b = Buffer.from(secret, 'utf8');
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  const secret = (process.env.CRON_SECRET || '').trim();
  if (!secret) return NextResponse.json({ error: 'Cron not configured' }, { status: 503 });
  if (!authorised(req, secret)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!rewardsConfig().enabled) return NextResponse.json({ ok: true, enabled: false });

  const now = Date.now();
  const deps = rewardsDeps(req);
  const out = { finished: 0, resolved: 0, failed: 0 };
  try {
    const db = supabaseAdmin();
    const pending = await db
      .from('promo_ledger')
      .select('user_id')
      .eq('status', 'pending')
      .lt('created_at', now - 2 * 60_000)
      .limit(BATCH);
    if (pending.error) throw pending.error;
    for (const userId of new Set(((pending.data ?? []) as { user_id: string }[]).map((r) => r.user_id))) {
      try {
        out.finished += await reconcile(deps, userId);
      } catch {
        out.failed++;
      }
    }
    // windows that ended and have not been reported, and time waiting in a bank
    const due = await db
      .from('promo_accounts')
      .select('user_id, promo_until, expired_for, banked_ms')
      .or(`and(promo_until.lt.${now},expired_for.is.null),banked_ms.gt.0`)
      .limit(BATCH);
    if (due.error) throw due.error;
    const ended = await db.from('promo_accounts').select('user_id, promo_until, expired_for').lt('promo_until', now).not('expired_for', 'is', null).limit(BATCH);
    const stale = ((ended.data ?? []) as { user_id: string; promo_until: number; expired_for: number }[]).filter((r) => Number(r.expired_for) !== Number(r.promo_until));
    const users = new Set([...((due.data ?? []) as { user_id: string }[]).map((r) => r.user_id), ...stale.map((r) => r.user_id)]);
    for (const userId of users) {
      try {
        await resolvePromo(deps, userId);
        out.resolved++;
      } catch {
        out.failed++;
      }
    }
  } catch (e) {
    console.error('[cron/rewards] failed', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, ...out }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ...out });
}
