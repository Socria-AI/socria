'use client';
// components/logos5/nav-side.ts — WHERE THE VIEWS ARE (Logos 6).
//
// The navigation between views (Everything, Mind Map, Files, Artifacts, Words; and outside the space, Conversation,
// Files, Artifacts, Mind Map) sits on the LEFT by default, as a rail, and can be moved to the top or the right. It is
// the person's choice, kept on this device (a convenience, not something to sync), and the same choice everywhere
// the views are switched. A phone keeps it at the top: there is no room for a rail.

import { useEffect, useState } from 'react';

export type NavSide = 'left' | 'top' | 'right';
export const NAV_SIDES: readonly NavSide[] = ['left', 'top', 'right'];
export const NAV_SIDE_SAID: Record<NavSide, string> = { left: 'Left', top: 'Top', right: 'Right' };
const KEY = 'socria.nav.side';
const subs = new Set<(s: NavSide) => void>();

/** The side chosen, or the left. */
export function readNavSide(): NavSide {
  try {
    const v = typeof window !== 'undefined' ? window.localStorage.getItem(KEY) : null;
    return (NAV_SIDES as readonly string[]).includes(v ?? '') ? (v as NavSide) : 'left';
  } catch {
    return 'left';
  }
}

/** Where the views are, and a way to move them; every place that draws them follows at once. */
export function useNavSide(): [NavSide, (s: NavSide) => void] {
  const [side, setSide] = useState<NavSide>('left');
  useEffect(() => {
    setSide(readNavSide());
    const on = (s: NavSide) => setSide(s);
    subs.add(on);
    return () => {
      subs.delete(on);
    };
  }, []);
  const move = (s: NavSide) => {
    try {
      window.localStorage.setItem(KEY, s);
    } catch {
      // a private window: it moves for now, and is not remembered
    }
    subs.forEach((f) => f(s));
  };
  return [side, move];
}
