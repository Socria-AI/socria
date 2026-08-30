// lib/entitlements.ts
//
// What each plan opens, in one table.
//
// This file is the single source for both the browser and the server. The UI
// reads it to say what you have left; the routes read it to decide. Nothing
// else should hold a number — a limit written in two places is a limit that
// will disagree with itself the first time it changes, and these numbers are
// meant to change as we learn what they should be.
//
// The shape of the free tier matters more than its size. It is a real trial,
// not a demo: you get the whole Chat → Map → Explore loop, you see your
// thinking become a map, you get to research something. What you run into is
// a BOUNDARY, not a wall — the map you built stays on screen, stays
// interactive, and stays yours. Nothing you have thought is ever taken back.
//
// Two things are never gated at any tier: TRACE (where a thought came from)
// and CORRECTION (telling Logos it read you wrong). Charging to see your own
// reasoning, or to fix it, would make the product dishonest.

import type { Plan } from './socria-one';

/**
 * A counter's name. The string is also its storage key, so renaming one
 * resets it — deliberate, and the reason they read as stable nouns.
 */
export const COUNTERS = [
  /** Logos conversations begun, per calendar month */
  'chats',
  /** Explore actions on a node, per conversation */
  'explore',
  /** Research runs, per conversation */
  'research',
  /** Challenge / counterpoint actions, per conversation */
  'challenge',
  /** Grounding a node in outside material, per conversation */
  'context',
  /** Images read, per conversation */
  'images',
  /** Text files read, per conversation */
  'files',
] as const;
export type Counter = (typeof COUNTERS)[number];

/** Whether a counter resets monthly or lives with a single conversation. */
export const COUNTER_SCOPE: Record<Counter, 'month' | 'chat'> = {
  chats: 'month',
  explore: 'chat',
  research: 'chat',
  challenge: 'chat',
  context: 'chat',
  images: 'chat',
  files: 'chat',
};

export interface Limits {
  /** null means no limit — One is bounded by fair use, not by a counter */
  readonly counters: Readonly<Record<Counter, number | null>>;
  /** nodes a map will grow to before it stops taking on new ones */
  readonly mapNodes: number | null;
  /** how many lenses onto the map are offered; null is all of them */
  readonly lenses: number | null;
  /** thinking depths other than Balanced */
  readonly allDepths: boolean;
  /** the map keeps re-organising itself as the conversation moves */
  readonly liveMap: boolean;
  /** how many turns of the conversation memory carries */
  readonly memoryTurns: number | null;
  /** attachments a single message may carry */
  readonly attachmentsPerMessage: number;
}

/**
 * Fair use rather than infinity. One is "Logos without the free tier's
 * limits", not "unmetered" — but the ceiling is set where nobody working
 * seriously will ever meet it, so it functions as a guard against abuse and
 * never as a boundary a person notices.
 */
export const PLANS: Record<Plan, Limits> = {
  free: {
    counters: {
      chats: 2,
      explore: 1,
      research: 1,
      challenge: 1,
      context: 1,
      images: 1,
      files: 1,
    },
    mapNodes: 8,
    lenses: 2,
    allDepths: false,
    liveMap: false,
    memoryTurns: 12,
    attachmentsPerMessage: 2,
  },
  one: {
    counters: {
      chats: 400,
      explore: null,
      research: 120,
      challenge: null,
      context: null,
      images: 60,
      files: 60,
    },
    mapNodes: null,
    lenses: null,
    allDepths: true,
    liveMap: true,
    memoryTurns: null,
    attachmentsPerMessage: 6,
  },
};

export function limitsFor(plan: Plan): Limits {
  return PLANS[plan];
}

/** The cap on one counter, or null for uncapped. */
export function limitOf(plan: Plan, counter: Counter): number | null {
  return PLANS[plan].counters[counter];
}

/** Has this counter run out? Uncapped never has. */
export function isSpent(plan: Plan, counter: Counter, used: number): boolean {
  const cap = limitOf(plan, counter);
  return cap !== null && used >= cap;
}

/** What is left, or null when uncapped. */
export function remaining(plan: Plan, counter: Counter, used: number): number | null {
  const cap = limitOf(plan, counter);
  return cap === null ? null : Math.max(0, cap - used);
}

// ── how a boundary is said ──────────────────────────────────────────
//
// One sentence for what has been used, one for what One offers. Calm, and
// never a countdown: nobody should feel a meter running while they think.
// These live here rather than at each call site so the voice stays one voice.

const REACHED: Record<Counter, string> = {
  chats:
    'That is both of your free lines of thinking for this month. The ones you have stay open, and stay yours.',
  explore: 'You have used your free Explore on this map.',
  research: 'You have used your free Research on this line of thinking.',
  challenge: 'You have used your free Challenge on this line of thinking.',
  context: 'You have grounded one node in outside material here.',
  images: 'Logos has read one image in this conversation.',
  files: 'Logos has read one file in this conversation.',
};

const OFFERS: Record<Counter, string> = {
  chats: 'Socria One keeps as many lines of thinking as you have.',
  explore: 'Socria One gives you more room to keep exploring your thinking.',
  research: 'Socria One opens Research whenever a question needs it.',
  challenge: 'Socria One lets Logos push back as often as it is useful.',
  context: 'Socria One grounds as much of your thinking as you want to bring.',
  images: 'Socria One reads as many images as your thinking involves.',
  files: 'Socria One reads as many files as your thinking involves.',
};

/** The two-sentence note shown when a free counter runs out. */
export function boundaryNote(counter: Counter): string {
  return `${REACHED[counter]} ${OFFERS[counter]}`;
}
