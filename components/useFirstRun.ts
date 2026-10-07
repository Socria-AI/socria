'use client';
// components/useFirstRun.ts
//
// The first-run record, as a surface reads and writes it.
//
// One hook, mounted by the chat and by Logos. Each reads the same key, hears
// the other's writes (a window event in this tab, the storage event across
// tabs), and — for an account — merges once with the copy on the profile row
// so a second device starts where the first left off. `reach()` returns
// whether the milestone was fresh, which is the only moment an event goes to
// analytics: a refresh re-reaches nothing.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ANALYTICS_FOR,
  EMPTY_FIRST_RUN,
  aheadOf,
  forgetFirstRunLocal,
  has,
  mergeFirstRun,
  parseFirstRun,
  reach as reachPure,
  readFirstRun,
  writeFirstRun,
  type FirstRun,
  type Milestone,
} from '@/lib/first-run';
import { track, type AnalyticsEvent } from '@/lib/analytics';

/** Fired in this tab whenever the record changes, so every mounted hook agrees. */
export const FIRST_RUN_CHANGED = 'socria:firstrun';

/** The account merge happens once per page life, whichever hook gets there first. */
let mergedForAccount = false;

async function putRemote(s: FirstRun): Promise<void> {
  try {
    await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstRun: s }),
    });
  } catch {
    // The browser's copy is the record of truth until the next sync.
  }
}

/**
 * START ONBOARDING AGAIN — for testing it (dev and preview only; the callers
 * check). Clears this browser's record and, for an account, the copy on the
 * profile, which a plain local clear would merge straight back. The caller
 * then navigates with a full page load, so every hook starts from nothing.
 */
export async function replayFirstRun(): Promise<void> {
  forgetFirstRunLocal(typeof window !== 'undefined' ? window.localStorage : null);
  mergedForAccount = false;
  try {
    // Signed out, this is a 401 and there is nothing on an account to clear.
    await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstRunReset: true }),
    });
  } catch {}
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(FIRST_RUN_CHANGED));
}

export function useFirstRun(opts: { signedIn: boolean; surface: 'core' | 'logos' }) {
  const [state, setState] = useState<FirstRun>(EMPTY_FIRST_RUN);
  // False until the browser's record has been read — a decision made on the
  // empty default would teach everybody the premise for one frame.
  const [ready, setReady] = useState(false);
  const surface = opts.surface;

  useEffect(() => {
    const sync = () => setState(readFirstRun(window.localStorage));
    sync();
    setReady(true);
    window.addEventListener(FIRST_RUN_CHANGED, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(FIRST_RUN_CHANGED, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  // The account's copy, merged in once. A union, so neither side can
  // un-teach the other; the browser is then told, and the account is told if
  // the browser knew something it did not — which is how a guest's record is
  // claimed by the account they go on to make.
  useEffect(() => {
    if (!opts.signedIn || mergedForAccount) return;
    mergedForAccount = true;
    (async () => {
      try {
        const res = await fetch('/api/profile', { cache: 'no-store' });
        if (!res.ok) return;
        const j = await res.json().catch(() => null);
        const local = readFirstRun(window.localStorage);
        if (!j || j.firstRun === undefined || j.firstRun === null) {
          // No row, or the column is not there yet: nothing to merge. Offer
          // what this browser knows; the route ignores it if it cannot keep it.
          if (Object.keys(local.at).length) await putRemote(local);
          return;
        }
        const remote = parseFirstRun(j.firstRun);
        const merged = mergeFirstRun(local, remote);
        writeFirstRun(window.localStorage, merged);
        window.dispatchEvent(new Event(FIRST_RUN_CHANGED));
        if (aheadOf(local, remote)) await putRemote(merged);
      } catch {
        // Offline, or the route is unhappy. The browser's copy stands.
      }
    })();
  }, [opts.signedIn]);

  const signedInRef = useRef(opts.signedIn);
  signedInRef.current = opts.signedIn;

  /**
   * Reach a milestone. True when it was fresh — the first time, ever, on any
   * device this record has been merged with.
   */
  const reach = useCallback(
    (m: Milestone, o: { skipped?: boolean } = {}): boolean => {
      const cur = readFirstRun(window.localStorage);
      const { state: next, fresh } = reachPure(cur, m, Date.now(), o);
      if (!fresh) return false;
      writeFirstRun(window.localStorage, next);
      setState(next);
      window.dispatchEvent(new Event(FIRST_RUN_CHANGED));
      const ev = ANALYTICS_FOR[m];
      if (ev) track(ev as AnalyticsEvent, { surface });
      if (o.skipped) track('onboarding_skipped', { surface, step: m });
      if (signedInRef.current) void putRemote(next);
      return true;
    },
    [surface]
  );

  const hasReached = useCallback((m: Milestone) => has(state, m), [state]);

  return { state, ready, reach, has: hasReached };
}
