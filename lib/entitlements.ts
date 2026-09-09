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
// THE SHAPE OF THE FREE TIER, AND WHY IT CHANGED.
//
// It used to clip every dimension at once: eight nodes, one lens, one depth,
// one Explore, one Research, twelve turns of memory — AND two lines of
// thinking a month. The intention was a real trial. The effect was that
// nobody on the free tier ever saw Socria be good. They saw a truncated
// version of everything, which reads as "this product is thin" rather than
// "I want more of this" — and people pay for more of a thing they have
// watched be excellent, never to upgrade something they have only seen be
// mediocre.
//
// So the axis moved. INSIDE a line of thinking, the free tier now gets
// exactly what a member gets: the map grows as far as the thinking does,
// every lens, every depth, Draft Space, Explore and Challenge and grounding
// whenever they help, and a thread whose memory is carried the whole way.
// What Socria One sells is no longer a better version of one conversation. It
// is MORE of them — two a month against as many as you have — and what runs
// BETWEEN them: the durable things Socria comes to know about how you reason,
// carried into every later conversation and into Logos.
//
// That is the whole difference, and it is meant to be sayable in a sentence.
// If a number below ever makes the free tier feel small inside a single
// conversation again, it is the wrong number.
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
  /** null means no limit — both plans are bounded by fair use, not by a counter */
  readonly counters: Readonly<Record<Counter, number | null>>;
  /** nodes a map will grow to before it stops taking on new ones; null is no ceiling */
  readonly mapNodes: number | null;
  /** how many lenses onto the map are offered; null is all of them */
  readonly lenses: number | null;
  /** thinking depths other than Balanced */
  readonly allDepths: boolean;
  /**
   * Draft Space — the writing surface a map feeds into.
   *
   * Open on both plans. It was the largest thing the free tier could not see,
   * and it is the clearest demonstration that a Thinking Map is for something:
   * a person who has watched their own map become a draft knows what another
   * line of thinking is worth. Charging for it bought a locked button.
   */
  readonly draftSpace: boolean;
  /** how many turns of a conversation its thread memory carries; null is all of them */
  readonly memoryTurns: number | null;
  /**
   * how many things Socria keeps about the person across conversations —
   * the entries in lib/person-memory.ts. The one thing besides volume that
   * separates the plans, because it is the one thing that only exists once
   * there have been several conversations to carry between.
   */
  readonly memoryEntries: number | null;
}

/**
 * Fair use rather than infinity, on BOTH plans.
 *
 * Every per-conversation ceiling below is identical for the two tiers and is
 * set where nobody working seriously will ever meet it: they are a guard
 * against a runaway loop, not a boundary a person notices, and the rate
 * limiter is the real defence against abuse. Only two rows differ, and they
 * are the two the product is sold on — `chats`, which is how many lines of
 * thinking a month, and `memoryEntries`, which is how much of you is carried
 * between them.
 */
export const PLANS: Record<Plan, Limits> = {
  free: {
    counters: {
      // The one limit anybody meets. Everything else here matches One.
      chats: 2,
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
    draftSpace: true,
    memoryTurns: null,
    // The other half of what One is: twelve things carried about you rather
    // than everything. See lib/person-memory.ts — this is a WINDOW onto one
    // store, not a smaller store, so nothing is lost by being on this plan.
    memoryEntries: 12,
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
    draftSpace: true,
    memoryTurns: null,
    memoryEntries: 160,
  },
};

/**
 * The counters that actually differ between the plans.
 *
 * Everything else is fair use held in common, and a prompt about a shared
 * ceiling would be selling somebody something they already have. The suite
 * asserts this list is the truth rather than a comment.
 */
export const TIERED_COUNTERS: readonly Counter[] = ['chats'];

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
// One sentence for what has been reached, one for what follows from it. Calm,
// and never a countdown: nobody should feel a meter running while they think.
// These live here rather than at each call site so the voice stays one voice.
//
// Only `chats` is a boundary the product sells past. The rest are the fair-use
// ceilings above, identical on both plans, and their note says so — offering
// somebody Socria One at a ceiling Socria One also has is a lie, and a small
// lie at a moment of friction is the most expensive kind.

/**
 * "both", for two — the free month's count read from the table rather than
 * written down a second time in prose that would then go stale.
 */
function freeChats(): string {
  const n = PLANS.free.counters.chats;
  if (n === null) return 'all';
  return n === 2 ? 'both' : `all ${n}`;
}

const REACHED: Record<Counter, string> = {
  chats:
    `That is ${freeChats()} of your free lines of thinking for this month. ` +
    'The ones you have stay open, and stay yours.',
  explore: 'Explore has run as far as it goes on this map.',
  research: 'Research has run as far as it goes in this line of thinking.',
  challenge: 'Challenge has run as far as it goes in this line of thinking.',
  context: 'This line of thinking is holding as much outside material as it can.',
  images: 'Logos has read as many images as it can hold in this conversation.',
  files: 'Logos has read as many files as it can hold in this conversation.',
};

/** Only where the plans differ. Keys here must be exactly TIERED_COUNTERS. */
const OFFERS: Partial<Record<Counter, string>> = {
  chats: 'Socria One keeps as many lines of thinking as you have.',
};

/** Said where they do not: the truth, which is that there is nothing to buy. */
const FAIR_USE =
  'Socria One stops in the same place — this is a guard against a runaway loop, not a thing to buy.';

/** The two-sentence note shown when a counter runs out. */
export function boundaryNote(counter: Counter): string {
  return `${REACHED[counter]} ${OFFERS[counter] ?? FAIR_USE}`;
}
