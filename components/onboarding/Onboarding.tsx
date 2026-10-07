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

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { FirstRunIntro } from '@/components/onboarding/FirstRunIntro';
import { replayFirstRun, useFirstRun } from '@/components/useFirstRun';
import { isProduction } from '@/lib/environment';
import { isOffered } from '@/lib/socria-model-store';
import { carry } from '@/lib/onboarding-script';
import { track } from '@/lib/analytics';

export function Onboarding() {
  const router = useRouter();
  const params = useSearchParams();
  const { isSignedIn } = useUser();
  const toLogos = params?.get('to') === 'logos';
  const surface = toLogos ? 'logos' : 'core';
  const firstRun = useFirstRun({ signedIn: !!isSignedIn, surface });

  // REPLAY (off production only): forget everything the first run has shown,
  // on this browser and on the account, then load this page again cleanly —
  // so a tester can walk through it as a new person without a new account or
  // an incognito window (which a protected preview will not let in).
  const replay = params?.get('replay') === '1' && !isProduction();
  const [clearing, setClearing] = useState(replay);
  useEffect(() => {
    if (!replay) return;
    let live = true;
    void replayFirstRun().then(() => {
      if (!live) return;
      window.location.replace(toLogos ? '/onboarding?to=logos' : '/onboarding');
    });
    return () => {
      live = false;
    };
  }, [replay, toLogos]);

  useEffect(() => {
    if (!clearing) track('socria_intro_started', { surface });
  }, [surface, clearing]);
  useEffect(() => setClearing(replay), [replay]);

  // The Logos door opens the newest Logos this person can use.
  const go = useCallback(() => {
    router.push(toLogos ? (isOffered('logos-3') ? '/chat?model=logos-3' : '/chat?model=logos-2') : '/chat');
  }, [router, toLogos]);

  if (clearing) return null;

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
