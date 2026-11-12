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
// THE SEVEN-DAY TRIAL AND SOCRIA ONE (November 9, 2026). The `free` plan below is now the trial's: a
// hard trial, not a free tier (lib/trial.ts). Its limit is tokens — 20,000 a UTC day, 140,000 across
// seven days — held on the server by lib/sleep-server.ts; the monthly counts that used to be the free
// tier are lifted to the same fair-use ceilings as Socria One, so the trial is the whole of Socria
// apart from the features below. After seven days every new AI request needs Socria One; nothing made
// is taken away. Socria One alone has Socria Voice, sharing a chat, the experiments (Use your hands,
// AR Mode, big-screen mode) and the Celestial and Socria One themes (lib/theme.ts).
//
// What follows is the October 31 note, kept for the history of the counters.
//
// THE FREE TIER AND SOCRIA ONE (October 31, 2026).
//
// Logos 5 is the one product, and Socria One is the one subscription:
//
//                         Free          Socria One ($15 a month)
//   Conversations         3 a month     unlimited (fair use)
//   Logic Maps            2 a month     unlimited
//   Logic Map nodes       10 a month    unlimited
//   Artifacts             2 a month     unlimited
//   Documents             1 a month     unlimited
//   Socria Voice          not included  included
//   Sharing a chat        not included  included
//
// That table is the whole of the free plan: there is no daily message count,
// no free month, no code, no reward and no gift beside it. Every number above
// is in PLANS below and nowhere else — the routes refuse from it (lib/quota.ts),
// the UI says what is left from it, and the copy is written from it. Changing
// a limit is changing one number here.
//
// HOW EACH ONE IS COUNTED. A conversation is counted once, when its first turn
// is answered — never per message, so going back to one already started costs
// nothing. A Logic Map is counted once per conversation, the first time a map
// is drawn for it. Nodes are counted as a map gains them — the ideas Socria
// draws from the conversation and the ones added by hand — and a map already
// drawn keeps every node it has. An artifact is counted once, when it is made
// (a display, a built model, a picture asked for, an Easy view, an element
// opened in Artifacts). A document is counted once, when one is brought into
// Content or written into it. Monthly counters reset on the first of the month,
// UTC.
//
// WHAT IS NEVER TAKEN. Nothing already made is removed or hidden when a limit
// is reached or a subscription ends: every conversation, map, artifact and
// document stays open and editable. A limit only stops something NEW from
// being made. Two things are never gated at any tier: TRACE (where a thought
// came from) and CORRECTION (telling Logos it read you wrong).
//
// Core is not a product here. Its reasoning runs inside Logos 5, and its
// conversations are counted against the same monthly conversations as
// everything else — there are no separate Core limits.

import type { Plan } from './socria-one';
import { TRIAL } from './trial';

/**
 * A counter's name. The string is also its storage key, so renaming one
 * resets it — deliberate, and the reason they read as stable nouns.
 */
export const COUNTERS = [
  /** conversations begun, per calendar month */
  'chats',
  /** messages sent to Socria, per day (UTC) — kept for the record; neither plan limits it */
  'messages',
  /** Logic Maps drawn — one per conversation, per calendar month */
  'maps',
  /** nodes added to Logic Maps, per calendar month */
  'nodes',
  /** artifacts made — one per artifact, per calendar month */
  'artifacts',
  /** documents brought into or written into Content — one per document, per calendar month */
  'documents',
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

/** Whether a counter resets monthly, resets daily, or lives with a single conversation. */
export const COUNTER_SCOPE: Record<Counter, 'month' | 'day' | 'chat'> = {
  chats: 'month',
  messages: 'day',
  maps: 'month',
  nodes: 'month',
  artifacts: 'month',
  documents: 'month',
  explore: 'chat',
  research: 'chat',
  challenge: 'chat',
  context: 'chat',
  images: 'chat',
  files: 'chat',
};

/**
 * The counters charged once per THING rather than once per action: a
 * conversation, its Logic Map, an artifact, a document. Each has a marker
 * beside the month's count (lib/quota.ts unitMark) so the same thing is never
 * charged twice — a retried first turn, a map redrawn, an artifact saved
 * again, a document read twice.
 */
export const UNIT_COUNTERS = ['chats', 'maps', 'artifacts', 'documents'] as const;
export type UnitCounter = (typeof UNIT_COUNTERS)[number];

/** Features one plan has and the other does not — not counted, simply open or not. */
export const FEATURES = ['voice', 'share', 'experiments'] as const;
export type Feature = (typeof FEATURES)[number];

export interface Limits {
  /** null means no limit — both plans are bounded by fair use, not by a counter */
  readonly counters: Readonly<Record<Counter, number | null>>;
  /**
   * nodes ONE map will grow to before it stops taking on new ones; null is no
   * ceiling. Neither plan has one now: the free plan's nodes are a monthly
   * count across every map (`nodes` above), not a size for each.
   */
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
  /**
   * The largest document a person can attach, in bytes.
   *
   * The free tier's number is not a choice but a platform's: a request to
   * one of our functions may carry about 4.5 MB, so a file that goes through
   * the server must be smaller than that. Socria One's larger files go
   * around the server instead — straight from the browser to private
   * storage through a one-time signed upload, read from there, and deleted
   * the moment they are read (app/api/files/upload, app/api/files/read).
   */
  readonly uploadBytes: number;
  /** Socria Voice (and Hold to talk), opening a share on something you own, and the experiments (Use your hands, AR Mode, big-screen mode) */
  readonly features: Readonly<Record<Feature, boolean>>;
}

/** The most a file may weigh and still travel to our server in the request itself. */
export const DIRECT_UPLOAD_BYTES = 4 * 1024 * 1024;

/** A size in megabytes, as the limits are said: "4 MB", "30 MB". */
export const megabytes = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;

/**
 * Both plans, in full.
 *
 * The per-conversation ceilings (explore … files) are identical on the two
 * plans and set where nobody working seriously meets them: a guard against a
 * runaway loop, not a boundary anyone is sold past. The rows that differ are
 * TIERED_COUNTERS, mapNodes, memoryEntries, uploadBytes and features.
 */
export const PLANS: Record<Plan, Limits> = {
  free: {
    // the trial's: tokens are its limit (lib/trial.ts), so the counts are Socria One's fair-use ceilings
    counters: {
      chats: 400,
      messages: null,
      maps: null,
      nodes: null,
      artifacts: null,
      documents: null,
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
    // twelve things carried about you rather than everything — a WINDOW onto
    // one store (lib/person-memory.ts), so nothing is lost by being on this plan
    memoryEntries: 12,
    uploadBytes: DIRECT_UPLOAD_BYTES,
    features: { voice: false, share: false, experiments: false },
  },
  one: {
    counters: {
      // Unlimited as sold. The one number here is a fair-use ceiling far past
      // any person's month — a guard against a script, not a plan boundary —
      // and it says so if it is ever met (boundaryNote with plan 'one').
      chats: 400,
      messages: null,
      maps: null,
      nodes: null,
      artifacts: null,
      documents: null,
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
    uploadBytes: 30 * 1024 * 1024,
    features: { voice: true, share: true, experiments: true },
  },
};

/**
 * The counters that actually differ between the plans.
 *
 * Everything else is fair use held in common, and a prompt about a shared
 * ceiling would be selling somebody something they already have. The suite
 * asserts this list is the truth rather than a comment.
 */
export const TIERED_COUNTERS: readonly Counter[] = [];

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

/** Does this plan include this feature? */
export function hasFeature(plan: Plan, feature: Feature): boolean {
  return PLANS[plan].features[feature];
}

/**
 * When a counter next starts again, in epoch milliseconds: the first of next
 * month for monthly counters, the next midnight for daily ones, both UTC; null
 * for per-conversation counters, which never reset.
 */
export function resetsAt(counter: Counter, at = Date.now()): number | null {
  const d = new Date(at);
  if (COUNTER_SCOPE[counter] === 'month') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  if (COUNTER_SCOPE[counter] === 'day') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  return null;
}

/**
 * Whether this many used is close enough to the limit to say so ahead of
 * time: the last of a small allowance (two maps, one document), the last two
 * of ten conversations or ten nodes. Never on an uncapped counter, never once
 * it is spent (that is the boundary, said by boundaryNote), and never for a
 * fair-use ceiling.
 */
export function nearLimit(plan: Plan, counter: Counter, used: number): boolean {
  if (!TIERED_COUNTERS.includes(counter)) return false;
  const left = remaining(plan, counter, used);
  const cap = limitOf(plan, counter);
  if (left === null || left === 0 || cap === null || plan === 'one') return false;
  return left <= (cap >= 10 ? 2 : 1);
}

// ── how a boundary is said ──────────────────────────────────────────
//
// One sentence for what has been reached, one for what follows from it. Calm,
// and never a countdown: nobody should feel a meter running while they think.
// These live here rather than at each call site so the voice stays one voice.
//
// Only the TIERED counters are boundaries the product sells past. The rest are
// the fair-use ceilings above, identical on both plans, and their note says so
// — offering somebody Socria One at a ceiling Socria One also has is a lie,
// and a small lie at a moment of friction is the most expensive kind.

/** A number from the free plan, as the copy says it. */
const free = (c: Counter) => PLANS.free.counters[c] ?? 0;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What one unit of each tiered counter is called, for the panel and the paywall. */
export const COUNTER_NOUN: Partial<Record<Counter, { one: string; many: string }>> = {
  chats: { one: 'conversation', many: 'conversations' },
  maps: { one: 'Logic Map', many: 'Logic Maps' },
  nodes: { one: 'Logic Map node', many: 'Logic Map nodes' },
  artifacts: { one: 'artifact', many: 'artifacts' },
  documents: { one: 'document', many: 'documents' },
};

/** "3 conversations a month", "2 Logic Maps a month" — a free allowance, as it is said. */
export function allowanceLabel(counter: Counter, plan: Plan = 'free'): string {
  const noun = COUNTER_NOUN[counter];
  const n = PLANS[plan].counters[counter];
  if (!noun) return counter;
  if (n === null || (plan === 'one' && TIERED_COUNTERS.includes(counter))) return `Unlimited ${noun.many}`;
  const per = COUNTER_SCOPE[counter] === 'day' ? ' a day' : COUNTER_SCOPE[counter] === 'month' ? ' a month' : '';
  return `${plural(n, noun.one, noun.many)}${per}`;
}

/** The headline at any free limit — the same sentence wherever one is met. */
export const LIMIT_HEADLINE = 'Your trial has reached its end.';
export const LIMIT_OFFER = 'Keep going with Socria One.';

const REACHED: Record<Counter, string> = {
  chats: `That’s ${plural(free('chats'), 'new conversation', 'new conversations')} this month, as many as fair use covers. Every one you’ve started stays open.`,
  messages: 'That’s as many messages as fair use covers today.',
  maps: 'That’s as many Logic Maps as fair use covers this month. This conversation keeps going; the maps you have stay yours.',
  nodes: 'That’s as many Logic Map nodes as fair use covers this month. Your maps keep every idea they have; new ones wait for next month.',
  artifacts: 'That’s as many artifacts as fair use covers this month. Everything already made stays in Artifacts.',
  documents: 'That’s as many documents as fair use covers this month. Your writing so far is kept.',
  explore: 'Explore has run as far as it goes on this map.',
  research: 'Research has run as far as it goes in this conversation.',
  challenge: 'Challenge has run as far as it goes in this conversation.',
  context: 'This conversation is holding as much outside material as it can.',
  images: 'Logos has read as many images as it can hold in this conversation.',
  files: 'Logos has read as many files as it can hold in this conversation.',
};

/** Said where the plans do not differ, or at Socria One's own fair-use ceiling: there is nothing to buy. */
const FAIR_USE = 'Socria One stops in the same place — this is a guard against a runaway loop, not a thing to buy.';
const ONE_FAIR_USE: Partial<Record<Counter, string>> = {
  chats: 'That’s a great many new conversations for one month — more than fair use covers. The ones you have stay open; new ones start again on the first.',
};

/**
 * The two-sentence note when a counter runs out: what was reached, then what
 * follows. On Socria One, or at a ceiling both plans share, it never offers
 * Socria One — selling somebody what they already have is a lie.
 */
export function boundaryNote(counter: Counter, plan: Plan = 'free'): string {
  if (plan === 'one') return ONE_FAIR_USE[counter] ?? `${REACHED[counter]} ${FAIR_USE}`;
  return `${REACHED[counter]} ${TIERED_COUNTERS.includes(counter) ? LIMIT_OFFER : FAIR_USE}`;
}

/** What a premium-only feature says to somebody without it. */
export const FEATURE_NOTE: Record<Feature, string> = {
  voice: 'Socria Voice is part of Socria One.',
  share: 'Sharing a conversation is part of Socria One.',
  experiments: 'The experiments — Use your hands, AR Mode and big-screen mode — are part of Socria One.',
};

/** The rows of the Trial / Socria One comparison, in the order they are shown. */
export function comparisonRows(): { id: string; label: string; free: string; one: string }[] {
  const yes = (plan: Plan, f: Feature) => (PLANS[plan].features[f] ? 'Included' : 'Not included');
  const t = trialNumbers();
  return [
    { id: 'ai', label: 'Conversations, Logic Maps and artifacts', free: `${t.days} days · ${t.daily} tokens a day`, one: 'Unlimited (fair use)' },
    { id: 'after', label: 'After the trial', free: 'Everything you made stays open', one: 'Keep going' },
    { id: 'voice', label: 'Socria Voice', free: yes('free', 'voice'), one: yes('one', 'voice') },
    { id: 'share', label: 'Sharing a chat', free: yes('free', 'share'), one: yes('one', 'share') },
    { id: 'experiments', label: 'Experiments (hands, AR Mode, big screen)', free: yes('free', 'experiments'), one: yes('one', 'experiments') },
    { id: 'themes', label: 'Celestial and Socria One themes', free: 'Not included', one: 'Included' },
    { id: 'files', label: 'Largest file', free: megabytes(PLANS.free.uploadBytes), one: megabytes(PLANS.one.uploadBytes) },
  ];
}

/** The trial's numbers as the copy says them ("7", "20,000", "140,000"). */
function trialNumbers(): { days: number; daily: string; total: string } {
  return { days: TRIAL.days, daily: TRIAL.daily.toLocaleString('en-GB'), total: TRIAL.total.toLocaleString('en-GB') };
}

/**
 * The free plan in one sentence, from the table — for the account sheet, the
 * docs, the FAQ and the pages, so no copy ever states a number of its own.
 */
export function freePlanSentence(): string {
  const t = trialNumbers();
  return `a ${t.days}-day trial: ${t.daily} tokens a day, up to ${t.total} in all`;
}

/** What each premium-only feature is called in a sentence. */
export const FEATURE_NAME: Record<Feature, string> = {
  voice: 'Socria Voice',
  share: 'chat sharing',
  experiments: 'the experiments',
};

/**
 * Socria One in one sentence, from the same table: no limit after the trial, then the features only
 * it includes — "Unlimited conversations, Logic Maps and artifacts after the trial, with Socria Voice,
 * chat sharing, the experiments and the Celestial and Socria One themes".
 */
export function onePlanSentence(): string {
  const only = [...FEATURES.filter((f) => PLANS.one.features[f] && !PLANS.free.features[f]).map((f) => FEATURE_NAME[f]), 'the Celestial and Socria One themes'];
  const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
  return `Unlimited conversations, Logic Maps and artifacts after the trial, with ${list(only)}`;
}
