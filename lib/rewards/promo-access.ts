// lib/rewards/promo-access.ts
//
// The one question the plan resolver asks of Socria Rewards: is promotional
// Socria One running for this person right now?
//
// READ-ONLY, ON PURPOSE. This runs on every gated request (through
// lib/socria-one-server.ts), so it reads one row and writes nothing. The
// writes that change the answer — starting banked time when other access has
// ended, pausing running time when someone subscribes, reporting an ending —
// happen in the explicit paths that can afford to be careful about them: the
// rewards sync (/api/rewards), the Stripe webhook, and the daily cron.
//
// Anything going wrong answers "no": a missing table, an unreachable database
// or rewards switched off leave the person exactly as entitled as they were
// before Socria Rewards existed.

import 'server-only';
import { rewardsConfig } from './rewards-config';
import { supabaseRewardsStore } from './supabase-rewards-store';

export async function promoActiveNow(userId: string): Promise<boolean> {
  if (!rewardsConfig().enabled) return false;
  try {
    const a = await supabaseRewardsStore().getAccount(userId);
    return !!a && (a.until ?? 0) > Date.now();
  } catch {
    return false;
  }
}

/** The account as stored, for surfaces that say how long is left. Null when there is none or it cannot be read. */
export async function promoSnapshot(userId: string): Promise<{ until: number | null; bankedMs: number } | null> {
  if (!rewardsConfig().enabled) return null;
  try {
    const a = await supabaseRewardsStore().getAccount(userId);
    return a ? { until: a.until, bankedMs: a.bankedMs } : null;
  } catch {
    return null;
  }
}
