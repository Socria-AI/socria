'use client';

// components/FirstTouch.tsx — notes how this browser first arrived, where
// that is allowed. See lib/first-touch.ts for what the note holds and why it
// is asked for before it is kept. Renders nothing.

import { useEffect } from 'react';
import { firstTouchFrom, recallFirstTouch, rememberFirstTouch } from '@/lib/first-touch';

export function FirstTouch() {
  useEffect(() => {
    let store: Storage | null = null;
    try {
      store = window.localStorage;
      if (recallFirstTouch(store, Date.now())) return;
    } catch {
      return;
    }
    // Read now, while this is still the landing; kept only once the server
    // says this visitor's country allows it.
    const ft = firstTouchFrom(window.location.href, document.referrer, Date.now());
    if (!ft) return;
    let cancelled = false;
    fetch('/api/first-touch')
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { remember?: unknown } | null) => {
        if (!cancelled && j?.remember === true) rememberFirstTouch(store, ft);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
