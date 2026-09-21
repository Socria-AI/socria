// The Memory page, at /memory.
//
// A view into Core 4's actual memory, not a picture of it. Everything here
// comes from /api/mind, which hands back mind_nodes and mind_edges as they
// are — the same rows the prompt was built from. If a node is on this screen,
// Core can reach it; if it is not here, Core does not know it.

'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { MindGraphView } from '@/components/mind/MindGraphView';

export default function MemoryPage() {
  const { isLoaded, isSignedIn } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded && !isSignedIn) router.replace('/sign-in?redirect_url=/memory');
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded || !isSignedIn) return null;

  return (
    <main className="dp-page">
      <div className="dp-wrap mg-wrap">
        <nav className="dp-crumbs">
          <Link href="/account">Account</Link>
          <span aria-hidden="true">/</span>
          <span>Memory</span>
        </nav>
        <h1>Memory</h1>
        <p className="dp-lead">
          What Socria understands about you, and how it connects. This is the
          memory itself — not a picture of it. Anything here can reach a
          conversation; anything you remove cannot come back.
        </p>
        <MindGraphView />
      </div>
    </main>
  );
}
