// lib/logos6/track6.ts — LOGOS 6'S EVENTS, AS THE BROWSER SENDS THEM.
//
// One door for every Logos 6 event (lib/analytics.ts track), adding the two
// things each needs and nothing else: the arm of a running feature test, when
// there is one, and a note of the last capability used — kept in this
// browser only — so a checkout can be counted against what came before it
// (H5; lib/logos6/vocab.ts CAPABILITIES). Shape only, as every event is.

import { track, type EventProps } from '../analytics';
import type { Capability, L6Event } from './vocab';

let armNow: 'control' | 'treatment' | undefined;

/** The arm this person's events carry while a feature test runs (lib/logos6/switches.ts armToken). */
export function setL6Arm(arm: 'control' | 'treatment' | undefined): void {
  armNow = arm;
}

/** Which capability an event is the use of — what a checkout seven days later is counted against. */
const USE: Partial<Record<L6Event, Capability>> = {
  challenge_shown: 'challenge',
  focus_opened: 'focus',
  source_check: 'sources',
  compare_run: 'compare',
  explain_back: 'explain',
  idea_added: 'idea',
};

export const LAST_CAPABILITY_KEY = 'socria.l6.last.v1';
const WEEK = 7 * 86_400_000;

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Remember the capability just used, with when. Never throws. */
export function noteCapability(cap: Capability, now = Date.now(), store: Pick<Storage, 'setItem'> | null = storage()): void {
  try {
    store?.setItem(LAST_CAPABILITY_KEY, JSON.stringify({ cap, at: now }));
  } catch {}
}

/** The capability used last, if within the seven days before `now`; 'none' otherwise. */
export function recentCapability(now = Date.now(), store: Pick<Storage, 'getItem'> | null = storage()): Capability {
  try {
    const raw = store?.getItem(LAST_CAPABILITY_KEY);
    if (!raw) return 'none';
    const v = JSON.parse(raw) as { cap?: unknown; at?: unknown };
    const at = typeof v?.at === 'number' ? v.at : 0;
    const cap = typeof v?.cap === 'string' ? (v.cap as Capability) : 'none';
    return at > 0 && now - at >= 0 && now - at <= WEEK ? cap : 'none';
  } catch {
    return 'none';
  }
}

/** Record a Logos 6 event. Never throws, never blocks. */
export function l6track(event: L6Event, props: EventProps = {}): void {
  track(event, { ...props, ...(armNow ? { arm: armNow } : {}) });
  const cap = USE[event];
  if (cap) noteCapability(cap);
}
