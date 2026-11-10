// lib/activity.ts — WHAT IS TAKING TIME, SAID ABOVE THE CHATBOX.
//
// Anything slow — a document being read, scanned pages read from their
// pictures, a document analysed, files sorted, a reply that has not started —
// says so here, under a key, and says when it is done. The composer shows the
// newest as one line above the box (components/LogosComposer.tsx), with how
// far along it is when that is known, so nothing slow ever looks like nothing
// happening.
//
// BROWSER STATE, in memory only.

import { useSyncExternalStore } from 'react';

export interface Activity {
  key: string;
  /** what is happening, in a few words: "Reading report.pdf" */
  says: string;
  /** how far along, when it can be counted */
  done?: number;
  of?: number;
  at: number;
}

const acts = new Map<string, Activity>();
const subs = new Set<() => void>();
let snapshot: Activity[] = [];
const EMPTY: Activity[] = [];

function changed() {
  snapshot = [...acts.values()].sort((a, b) => a.at - b.at);
  for (const s of subs) s();
}

/** Something has started taking time (or moved on): said under its key until it ends. */
export function setActivity(key: string, says: string, progress?: { done: number; of: number }) {
  const had = acts.get(key);
  const next: Activity = { key, says, at: had?.at ?? Date.now(), ...(progress && progress.of > 0 ? { done: Math.min(progress.done, progress.of), of: progress.of } : {}) };
  if (had && had.says === next.says && had.done === next.done && had.of === next.of) return;
  acts.set(key, next);
  changed();
}

export function endActivity(key: string) {
  if (acts.delete(key)) changed();
}

/** Run something slow with its line shown for as long as it takes. */
export async function withActivity<T>(key: string, says: string, run: () => Promise<T>): Promise<T> {
  setActivity(key, says);
  try {
    return await run();
  } finally {
    endActivity(key);
  }
}

const subscribe = (fn: () => void) => {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
};

/** Everything taking time now, oldest first. */
export function useActivities(): Activity[] {
  return useSyncExternalStore(subscribe, () => snapshot, () => EMPTY);
}

/** The line to show: the newest thing, and how many more are under way. */
export function activityLine(list: readonly Activity[]): { says: string; done?: number; of?: number; more: number } | null {
  if (!list.length) return null;
  const top = list[list.length - 1];
  return { says: top.says, ...(top.of ? { done: top.done ?? 0, of: top.of } : {}), more: list.length - 1 };
}
