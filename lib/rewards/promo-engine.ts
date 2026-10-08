// lib/rewards/promo-engine.ts
//
// PROMOTIONAL SOCRIA ONE — the arithmetic, with nothing else in it.
//
// Every reward Socria gives (the 5-Node Challenge, a friend's sign-up, a
// friend becoming active) is a number of days of Socria One. This module
// decides what a reward does to a person's promotional account, and what that
// account means right now. It does no I/O; the store and the service around it
// (rewards-service.ts) make the decisions durable and race-free.
//
// THE RULES, which the tests pin:
//
//   1. PAID ACCESS IS NEVER TOUCHED. Promotional time is a layer over the
//      person's own entitlement (a Stripe subscription, a complimentary or
//      student grant), never a replacement for it. While they hold that, a
//      reward is BANKED: kept, not spent, and not started. It starts when the
//      other access ends. Stripe is never asked to change anything.
//
//   2. REWARDS STACK END TO END. A reward that arrives while promotional time
//      is running extends it from where it ends, not from now — two seven-day
//      rewards are fourteen days, in order, whichever arrived first.
//
//   3. NOTHING EXCEEDS THE BANK CAP. Promotional time still to come — what is
//      left of the running window plus what is banked — never exceeds the cap
//      (30 days by default). A reward that would cross it is trimmed to fit,
//      and the trim is recorded, so "the cap" is a rule and not a surprise.
//
//   4. EACH REWARD APPLIES ONCE. A reward carries a key ('challenge:<user>',
//      'referral_signup:<user>', 'referral_activation:<referred>'), and the
//      keys already applied live on the account itself — the same row whose
//      update is atomic — so a retried, duplicated or raced grant is a no-op.
//
//   5. REFERRAL REWARDS ARE CAPPED PER CALENDAR MONTH (UTC). The counter lives
//      on the account too, for the same reason: checking it and spending it
//      must be one write, or two activations at once could both see room.
//
//   6. PAYING MID-REWARD LOSES NOTHING. If someone with promotional time
//      running becomes a paying member, what is left of it moves to the bank
//      (paused, not burned) and comes back if the paid access ever ends.
//
//   7. EXPIRY IS AUTOMATIC. Promotional access is "until" a moment; past it
//      the person is simply on whatever they hold without it. Its ending is
//      reported once (`expiredFor`), for analytics, never acted on further.
//
// PURE.

import type { RewardsConfig } from './rewards-config';

export const REWARD_SOURCES = ['challenge', 'referral_signup', 'referral_activation'] as const;
export type RewardSource = (typeof REWARD_SOURCES)[number];

export interface PromoAccount {
  userId: string;
  /** optimistic-concurrency version: every write is "if version is still N, write N+1" */
  version: number;
  /** promotional Socria One runs until this moment (ms since epoch); null when it never has */
  until: number | null;
  /** promotional time held for later — earned or paused while other access was held (ms) */
  bankedMs: number;
  /** reward keys already applied to this account — the idempotency */
  applied: string[];
  /** the month ('YYYY-MM', UTC) the referral counter below belongs to */
  refMonth: string | null;
  /** referral rewards granted to this person in refMonth */
  refCount: number;
  /** the `until` whose ending has already been reported */
  expiredFor: number | null;
  /** when this person, holding reward time, first became a paying member */
  convertedAt: number | null;
}

export function emptyAccount(userId: string): PromoAccount {
  return { userId, version: 0, until: null, bankedMs: 0, applied: [], refMonth: null, refCount: 0, expiredFor: null, convertedAt: null };
}

export interface Grant {
  /** unique for all time: what makes this reward impossible to claim twice */
  key: string;
  source: RewardSource;
  days: number;
}

/**
 * What a grant did.
 *   active       the time was added to running (or newly started) promotional access
 *   banked       the person holds Socria One some other way, so the time was saved for later
 *   bank_full    the cap was already reached: nothing could be added
 *   monthly_cap  a referral reward past this month's limit: nothing was added
 *   duplicate    this key was applied before: nothing changed
 * A trimmed grant is 'active' or 'banked' with trimmedMs > 0.
 */
export type GrantOutcome = 'active' | 'banked' | 'bank_full' | 'monthly_cap' | 'duplicate';

export interface GrantResult {
  account: PromoAccount;
  outcome: GrantOutcome;
  appliedMs: number;
  trimmedMs: number;
  /** when the promotional access this grant joined now ends; null when banked or nothing applied */
  endsAt: number | null;
}

/** The calendar month a moment falls in, in UTC — the referral counter's unit. */
export function monthKey(now: number): string {
  const d = new Date(now);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Promotional time still to come: what is left of the window, plus the bank (ms). */
export function remainingMs(a: PromoAccount, now: number): number {
  return Math.max(0, (a.until ?? 0) - now) + Math.max(0, a.bankedMs);
}

/** Referral rewards already granted this calendar month. */
export function referralsThisMonth(a: PromoAccount, now: number): number {
  return a.refMonth === monthKey(now) ? a.refCount : 0;
}

/**
 * Apply one reward.
 *
 * `baseEntitled` is whether the person holds Socria One some other way RIGHT
 * NOW (paid, complimentary, student). It decides banked vs active — and it is
 * asked of the real entitlement, never of the promotional account.
 */
export function applyGrant(
  a: PromoAccount,
  g: Grant,
  ctx: { now: number; baseEntitled: boolean; cfg: Pick<RewardsConfig, 'dayMs' | 'bankCapDays' | 'referral'> }
): GrantResult {
  const { now, baseEntitled, cfg } = ctx;
  if (a.applied.includes(g.key)) return { account: a, outcome: 'duplicate', appliedMs: 0, trimmedMs: 0, endsAt: null };
  const want = Math.max(0, Math.round(g.days)) * cfg.dayMs;
  const next: PromoAccount = { ...a, applied: [...a.applied, g.key], version: a.version + 1 };

  if (g.source === 'referral_activation') {
    const used = referralsThisMonth(a, now);
    if (used >= cfg.referral.monthlyCap) {
      return { account: next, outcome: 'monthly_cap', appliedMs: 0, trimmedMs: want, endsAt: null };
    }
  }

  const room = Math.max(0, cfg.bankCapDays * cfg.dayMs - remainingMs(a, now));
  const give = Math.min(want, room);
  if (give <= 0) return { account: next, outcome: 'bank_full', appliedMs: 0, trimmedMs: want, endsAt: null };

  if (g.source === 'referral_activation') {
    // counted only when something was actually given: a full bank does not spend a month's slot
    const m = monthKey(now);
    next.refCount = (a.refMonth === m ? a.refCount : 0) + 1;
    next.refMonth = m;
  }

  if (baseEntitled) {
    next.bankedMs = a.bankedMs + give;
    return { account: next, outcome: 'banked', appliedMs: give, trimmedMs: want - give, endsAt: null };
  }
  // stack end to end: from where running promotional time ends, or from now
  next.until = Math.max(now, a.until ?? 0) + give;
  return { account: next, outcome: 'active', appliedMs: give, trimmedMs: want - give, endsAt: next.until };
}

export interface ResolveResult {
  account: PromoAccount;
  /** the account changed and must be written */
  changed: boolean;
  /** promotional access is what entitles them right now */
  promoActive: boolean;
  /** the promotional window just ended and has not been reported before */
  expired: boolean;
}

/**
 * What the account means right now — and the one or two writes that keep it
 * honest: pausing running time when other access appears (rule 6), starting
 * the bank when other access is gone (rule 1), and noting an ending once.
 */
export function resolveAccount(a: PromoAccount, ctx: { now: number; baseEntitled: boolean }): ResolveResult {
  const { now, baseEntitled } = ctx;
  let next = a;
  let changed = false;
  const bump = (patch: Partial<PromoAccount>) => {
    next = { ...next, ...patch, version: a.version + 1 };
    changed = true;
  };
  if (baseEntitled) {
    if ((next.until ?? 0) > now) bump({ bankedMs: next.bankedMs + ((next.until as number) - now), until: now });
    return { account: next, changed, promoActive: false, expired: false };
  }
  if (next.bankedMs > 0) bump({ until: Math.max(now, next.until ?? 0) + next.bankedMs, bankedMs: 0 });
  const promoActive = (next.until ?? 0) > now;
  let expired = false;
  if (!promoActive && next.until !== null && next.expiredFor !== next.until) {
    bump({ expiredFor: next.until });
    expired = true;
  }
  return { account: next, changed, promoActive, expired };
}

/**
 * Someone who has had reward time became a paying member. Recorded once — the
 * moment the promotion converted — and only for somebody a reward ever reached.
 */
export function markConverted(a: PromoAccount, now: number): { account: PromoAccount; converted: boolean } {
  if (a.convertedAt !== null || a.applied.length === 0) return { account: a, converted: false };
  return { account: { ...a, convertedAt: now, version: a.version + 1 }, converted: true };
}

/** Whole days, rounded up — "6 days left" while any of the sixth remains. */
export function daysOf(ms: number, dayMs: number): number {
  return ms <= 0 ? 0 : Math.ceil(ms / dayMs);
}
