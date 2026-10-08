'use client';
// components/rewards/RewardsSync.tsx
//
// Asks Socria Rewards once when a signed-in person opens Socria — the moment
// a friend's link opened before sign-up becomes their seven days, and a
// referred person's activity becomes their friend's reward. Renders nothing;
// the answer is shared with the account sheet and the Logos chip
// (useRewards), so this costs one request, not three.

import { useRewards } from './useRewards';

export function RewardsSync({ enabled }: { enabled: boolean }) {
  useRewards({ enabled });
  return null;
}
