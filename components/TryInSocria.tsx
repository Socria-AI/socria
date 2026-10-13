'use client';

// components/TryInSocria.tsx — "Try this", from any page into the chat.
//
// One press opens the chat with an example already written in the composer,
// so somebody who arrived from a search lands inside a working session
// instead of an empty box. It uses the handover the homepage's own box and
// onboarding use (carry → takeCarried in lib/onboarding-script.ts): session
// storage, same site, read once.
//
// It fills the composer and NEVER sends. The person reads it, changes it if
// they like, and presses send themselves — nothing is said on their behalf.
// Core opens without an account; an example written for Logos opens Logos,
// whose own gate asks for one.

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { carry } from '@/lib/onboarding-script';

export function TryInSocria({
  text,
  surface = 'core',
  className,
  children,
}: {
  /** the example, as the person would type it */
  text: string;
  surface?: 'core' | 'logos';
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const go = () => {
    carry(typeof sessionStorage !== 'undefined' ? sessionStorage : null, {
      text,
      intent: 'try',
      // the current Logos; without a model the handover opens Logos 2
      ...(surface === 'logos' ? { surface: 'logos' as const, model: 'logos-3' as const } : {}),
    });
    router.push(surface === 'logos' ? '/chat?model=logos' : '/chat');
  };
  return (
    <button type="button" className={className} onClick={go}>
      {children}
    </button>
  );
}
