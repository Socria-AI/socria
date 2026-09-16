'use client';
// components/Hint.tsx
//
// One line, beside the thing it describes, once.
//
// Never a tour, never sequenced, never more than one on screen — the parent
// asks lib/hints.ts which single hint the screen currently justifies, and
// renders only that. Dismissing is a quiet "got it"; the account sheet's
// "Show hints again" brings them all back.

import { useCallback, useEffect, useState } from 'react';
import { markSeen, readSeen } from '@/lib/hints';

/** Fired when any hint is dismissed or all are restored. */
export const HINTS_CHANGED = 'socria:hints';

export function useSeenHints(): string[] {
  const [seen, setSeen] = useState<string[]>([]);
  useEffect(() => {
    const sync = () => setSeen(readSeen(window.localStorage));
    sync();
    window.addEventListener(HINTS_CHANGED, sync);
    return () => window.removeEventListener(HINTS_CHANGED, sync);
  }, []);
  return seen;
}

export function Hint({
  id,
  place = 'above',
  children,
}: {
  id: string;
  place?: 'above' | 'below' | 'inline';
  children: React.ReactNode;
}) {
  const dismiss = useCallback(() => {
    markSeen(window.localStorage, id);
    window.dispatchEvent(new Event(HINTS_CHANGED));
  }, [id]);

  return (
    <div className={'hint hint-' + place} role="note">
      <p>{children}</p>
      <button type="button" onClick={dismiss}>
        got it
      </button>
    </div>
  );
}
