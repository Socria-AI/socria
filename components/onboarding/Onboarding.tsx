'use client';
// components/onboarding/Onboarding.tsx
//
// Where a new account begins: the premise, the person's own thought, and
// then the product. The sequence is components/onboarding/FirstRunIntro.tsx —
// the same two beats the chat and Logos show a first-time visitor — so this
// route adds nothing of its own except the handover: the sentence goes into
// session storage, and the surface it was written for picks it up.
//
// WHICH SURFACE. Logos 5, the one there is (docs/ARCHIVE.md). It used to be
// the chat unless the person came by the Logos page's door (`?to=logos`, still
// accepted), with a question choosing between Core 4 and Logos; both went with
// the Core chat on 24 October 2026.

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { FirstRunIntro } from '@/components/onboarding/FirstRunIntro';
import { replayFirstRun, useFirstRun } from '@/components/useFirstRun';
import { isProduction } from '@/lib/environment';
import { carry } from '@/lib/onboarding-script';
import { track } from '@/lib/analytics';

export function Onboarding() {
  const router = useRouter();
  const params = useSearchParams();
  const { isSignedIn, user } = useUser();
  const toLogos = params?.get('to') === 'logos';
  const surface = 'logos';
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

  // WHERE THEY LAND: Logos 5, with what they wrote sent for them.
  const go = useCallback(() => router.push('/chat'), [router]);

  if (clearing) return null;

  return (
    <FirstRunIntro
      surface={surface}
      defaultName={user?.firstName ?? null}
      signedIn={!!isSignedIn}
      onStart={(text, intent) => {
        firstRun.reach('socria.intro');
        carry(typeof sessionStorage !== 'undefined' ? sessionStorage : null, {
          text,
          intent,
          surface: 'logos',
          // it goes straight through: they land on Socria's answer to their own
          // question, and the tour starts from there
          send: true,
        });
        go();
      }}
      onSkip={() => {
        firstRun.reach('socria.intro', { skipped: true });
        go();
      }}
    />
  );
}
