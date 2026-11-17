'use client';
// components/inline/marks.ts — WHAT A REPLY POINTS AT, LIT ACROSS ITS ELEMENTS.
//
// A graph's highlights (lib/inline-ui.ts GraphHighlight) are numbered; a line of the working can carry the same
// number (StepsSpec lines' `mark`). Pointing at either — a hover, a focus, a press — lights both, wherever they are
// drawn: in the conversation, or as separate cards on the Everything board. The elements of one reply share a
// scope (the message's id, InlineHost.scope); without one, an element lights only itself.
//
// A hover lights while it lasts; a press pins the light until pressed again (or another is pressed).

import { useState, useSyncExternalStore } from 'react';

type Lit = { hover: number | null; pin: number | null };
const lit = new Map<string, Lit>();
const subs = new Set<() => void>();
const NONE: Lit = { hover: null, pin: null };

function set(scope: string, next: Lit) {
  const cur = lit.get(scope) ?? NONE;
  if (cur.hover === next.hover && cur.pin === next.pin) return;
  lit.set(scope, next);
  subs.forEach((f) => f());
}

/** Point at a mark from outside an element (tests, or a host that wants to show one). */
export function pointAt(scope: string, mark: number | null) {
  set(scope, { hover: null, pin: mark });
}

/** The mark lit in this scope, and the three ways an element points at one. */
export function useMarks(scope?: string): { lit: number | null; enter: (m: number) => void; leave: () => void; press: (m: number) => void } {
  const [local, setLocal] = useState<Lit>(NONE);
  const shared = useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => {
        subs.delete(cb);
      };
    },
    () => (scope ? lit.get(scope) ?? NONE : NONE),
    () => NONE
  );
  const now = scope ? shared : local;
  const put = (next: Lit) => (scope ? set(scope, next) : setLocal(next));
  return {
    lit: now.hover ?? now.pin,
    enter: (m) => put({ ...now, hover: m }),
    leave: () => put({ ...now, hover: null }),
    press: (m) => put({ hover: null, pin: now.pin === m ? null : m }),
  };
}
