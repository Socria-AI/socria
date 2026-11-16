'use client';
// The page's client half: whether someone is signed in, without waiting for it.

import { useUser } from '@clerk/nextjs';
import { V0App } from '@/components/ux-v0/V0App';

export function V0Client() {
  const { isSignedIn } = useUser();
  return <V0App signedIn={!!isSignedIn} />;
}
