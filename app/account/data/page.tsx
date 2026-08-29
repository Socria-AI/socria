// Settings → Data & Privacy, at /account/data.
//
// Its own route rather than a tab inside Clerk's profile, because the things
// it controls are ours, not the auth provider's: the conversations, the maps,
// and the memory built from them.

'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { DataPrivacyPanel } from '@/components/DataPrivacyPanel';

export default function DataPrivacyPage() {
  const { isLoaded, isSignedIn } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded && !isSignedIn) router.replace('/sign-in?redirect_url=/account/data');
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded || !isSignedIn) return null;

  return (
    <main className="dp-page">
      <div className="dp-wrap">
        <nav className="dp-crumbs">
          <Link href="/account">Account</Link>
          <span aria-hidden="true">/</span>
          <span>Data &amp; Privacy</span>
        </nav>
        <h1>Data &amp; Privacy</h1>
        <p className="dp-lead">
          What Socria holds for you, and everything you can do about it.
        </p>
        <DataPrivacyPanel />
      </div>
    </main>
  );
}
