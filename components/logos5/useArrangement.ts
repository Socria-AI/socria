'use client';
// components/logos5/useArrangement.ts — the Universal Map's arrangement, kept.
//
// This browser's copy at once; signed in, the account's too
// (/api/profile?only=universalMap) — the newer of the two wins, and every
// change is written to both, the account's a moment later so a drag is one
// write, not fifty. An account that cannot hold it yet (no column) is simply
// not written to: the browser's copy is the arrangement.

import { useCallback, useEffect, useRef, useState } from 'react';
import { emptyArrangement, parseArrangement, readHome, stamp, writeHome, type Arrangement } from '@/lib/logos5/arrange';

const PUSH_AFTER = 1200;

const storage = () => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

export function useArrangement(signedIn: boolean, initial?: Arrangement) {
  const [arr, setArr] = useState<Arrangement>(() => initial ?? emptyArrangement());
  const [ready, setReady] = useState(!!initial);
  const latest = useRef(arr);
  latest.current = arr;
  /** can the account hold it: not asked yet, yes, or no */
  const account = useRef<'unknown' | 'yes' | 'no'>('unknown');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** the copy waiting to go to the account */
  const waiting = useRef<Arrangement | null>(null);

  useEffect(() => {
    if (initial) return;
    setArr(readHome(storage()));
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = useCallback((a: Arrangement, leaving = false) => {
    waiting.current = null;
    void fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ universalMap: a }), keepalive: leaving })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (Array.isArray(j?.unsaved) && j.unsaved.includes('universalMap')) account.current = 'no';
      })
      .catch(() => {});
  }, []);

  const push = useCallback(
    (a: Arrangement) => {
      if (!signedIn || account.current === 'no') return;
      waiting.current = a;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        if (waiting.current) send(waiting.current);
      }, PUSH_AFTER);
    },
    [signedIn, send]
  );

  // signed in: the account's copy, and the newer of the two wins
  useEffect(() => {
    if (!signedIn || !ready) return;
    let gone = false;
    fetch('/api/profile?only=universalMap', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (gone || !j || !('universalMap' in j)) return;
        if (j.universalMap === null) {
          account.current = 'no';
          return;
        }
        account.current = 'yes';
        const theirs = parseArrangement(j.universalMap);
        const mine = latest.current;
        if (theirs.at > mine.at) {
          setArr(theirs);
          writeHome(storage(), theirs);
        } else if (mine.at > theirs.at) push(mine);
      })
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, [signedIn, ready, push]);

  // leaving the map — a conversation opened — sends what was waiting, now
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (waiting.current) send(waiting.current, true);
    },
    [send]
  );

  /** The arrangement, changed: kept here at once, and in the account a moment later. */
  const put = useCallback(
    (next: Arrangement) => {
      const a = stamp(next, Date.now());
      latest.current = a;
      setArr(a);
      writeHome(storage(), a);
      push(a);
    },
    [push]
  );

  return { arr, put, ready };
}
