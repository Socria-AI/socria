'use client';
// components/onboarding/Onboarding.tsx
//
// Where a new account begins: the premise, the person's own thought, and
// then the product. The sequence is components/onboarding/FirstRunIntro.tsx —
// the same two beats the chat and Logos show a first-time visitor — so this
// route adds nothing of its own except the handover: the sentence goes into
// session storage, and the surface it was written for picks it up.
//
// WHICH SURFACE. The chat, unless the person came here on their way to Logos
// (`?to=logos` — the Logos page's own door). Nobody is asked to choose between
// Core and Logos: a new person should not need the product's taxonomy before
// receiving anything from it.

import { useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { FirstRunIntro } from '@/components/onboarding/FirstRunIntro';
import { useFirstRun } from '@/components/useFirstRun';
import { carry } from '@/lib/onboarding-script';
import { track } from '@/lib/analytics';

export function Onboarding() {
  const router = useRouter();
  const params = useSearchParams();
  const { isSignedIn } = useUser();
  const toLogos = params?.get('to') === 'logos';
  const surface = toLogos ? 'logos' : 'core';
  const firstRun = useFirstRun({ signedIn: !!isSignedIn, surface });

  useEffect(() => {
    track('socria_intro_started', { surface });
  }, [surface]);

  const go = useCallback(() => {
    router.push(toLogos ? '/chat?model=logos-2' : '/chat');
  }, [router, toLogos]);

  return (
    <FirstRunIntro
      surface={surface}
      onStart={(text, intent) => {
        firstRun.reach('socria.intro');
        carry(typeof sessionStorage !== 'undefined' ? sessionStorage : null, { text, intent, surface });
        go();
      }}
      onSkip={() => {
        firstRun.reach('socria.intro', { skipped: true });
        go();
      }}
    />
  );
}
