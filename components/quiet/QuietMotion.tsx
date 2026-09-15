'use client';
// components/quiet/QuietMotion.tsx
//
// Starts the scroll drivers on a quiet-register page.
//
// It reuses the journal's initJournal() rather than porting quiet.js's own
// copy, because they ARE the same code — quiet.js and issue.js share the
// reveal contract, the reading-progress fill and the anim-off guard, and a
// second implementation of that would be a second thing to keep in step.
//
// Safe to call from anywhere: it is guarded against running twice (React 18
// mounts effects twice in development, and every driver installs listeners),
// and each driver queries for its own elements and no-ops when they are not
// on the page — which is most of them, here.

import { useEffect } from 'react';
import { initJournal } from '@/components/journal/drivers';

export function QuietMotion() {
  useEffect(() => {
    initJournal();
  }, []);
  return null;
}
