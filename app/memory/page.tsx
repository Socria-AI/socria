// The Memory page, at /memory.
//
// A view into Core 4's actual memory, not a picture of it. Everything here
// comes from /api/mind, which hands back mind_nodes and mind_edges as they
// are — the same rows the prompt was built from. If a node is on this screen,
// Core can reach it; if it is not here, Core does not know it.
//
// The page is a shell and nothing else. Below the graph, Core4Record shows
// what Core 4 recorded about their thinking, from /api/core4.
// MindGraphView owns the whole surface
// including its own heading, because the heading is one of the things that
// CHANGES with state: "What Socria remembers." is wrong on a deployment where
// memory is not running, and wrong again when there is nothing yet. A title
// fixed out here would have to be true of all three.

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { MindGraphView } from '@/components/mind/MindGraphView';
import { Core4Record } from '@/components/mind/Core4Record';

export default function MemoryPage() {
  const { isLoaded, isSignedIn } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded && !isSignedIn) router.replace('/sign-in?redirect_url=/memory');
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded || !isSignedIn) return null;

  // The Mind Graph is what Socria knows about them; Core4Record is what Core
  // 4 recorded about their THINKING — the reasoning ledger, what it took
  // into account, the capability evidence — each correctable.
  return (
    <>
      <MindGraphView />
      <Core4Record />
    </>
  );
}
