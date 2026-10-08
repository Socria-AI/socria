// lib/rewards/rewards-service.ts
//
// SOCRIA REWARDS — the decisions, made durable.
//
// The rules live in promo-engine.ts (what a reward does to an account),
// challenge-rule.ts (what counts as five nodes) and referral-rule.ts (who is a
// new friend, what "active" means). This module runs them against a store
// (rewards-store.ts) under two guarantees, both tested with interleaved
// concurrent callers:
//
//   A REWARD IS GRANTED AT MOST ONCE. Its ledger row is inserted under a key
//   unique for all time before anything else happens; the key is then added to
//   the account in the same compare-and-swap that adds the time. A retry, a
//   double click, a second tab or two servers at once all end the same way:
//   one application. A grant that died half-way (ledger row written, account
//   not) is finished by the next call that touches the person — never twice,
//   because the account remembers what it applied.
//
//   A LIMIT IS CHECKED WHERE IT IS SPENT. The bank cap and the monthly
//   referral limit are read and written in that same compare-and-swap, so two
//   rewards arriving together cannot both see room that only one of them has.
//
// Everything outside the store — the clock, whether the person already holds
// Socria One, analytics, cache invalidation, randomness — is passed in, which
// is what lets the tests run every path without a database or a network.

import { applyGrant, daysOf, emptyAccount, markConverted, referralsThisMonth, remainingMs, resolveAccount, type Grant, type GrantOutcome, type PromoAccount, type RewardSource } from './promo-engine';
import { evaluateChallenge, type ChallengeSession } from './challenge-rule';
import { activationProgress, checkAttribution, makeCode, type ActivitySession, type AttributionRefusal, type EmailFact, type RefCookie } from './referral-rule';
import type { RewardsConfig } from './rewards-config';
import type { LedgerRow, ReferralRow, ReferralStatus, RewardsStore } from './rewards-store';

export type RewardsEvent =
  | 'rewards_challenge_completed'
  | 'rewards_challenge_reward_granted'
  | 'rewards_referral_signup_completed'
  | 'rewards_referral_activation_completed'
  | 'rewards_referral_reward_granted'
  | 'rewards_promo_expired'
  | 'rewards_promo_converted';

export interface RewardsDeps {
  store: RewardsStore;
  cfg: RewardsConfig;
  now: () => number;
  /** whether the person holds Socria One OTHER than by promotion — paid, complimentary, student */
  baseEntitled: (userId: string) => Promise<boolean>;
  /** analytics: shape only — a kind, an outcome, a surface. Never an id, never words. */
  track?: (event: RewardsEvent, props?: { kind?: string; outcome?: string; surface?: string }) => void | Promise<void>;
  /** the person's entitlement may have changed: drop anything cached about it */
  changed?: (userId: string) => void;
  /** n random bytes (crypto in production) */
  random: (n: number) => ArrayLike<number>;
}

const ATTEMPTS = 12;

export class RewardsBusy extends Error {
  constructor() {
    super('rewards: the account kept changing under us; the reward is recorded and will be finished on the next visit');
  }
}

async function ensureAccount(store: RewardsStore, userId: string): Promise<PromoAccount> {
  const got = await store.getAccount(userId);
  if (got) return got;
  await store.createAccount(emptyAccount(userId));
  const again = await store.getAccount(userId);
  if (!again) throw new Error('rewards: account could not be created');
  return again;
}

export interface GrantDone {
  outcome: GrantOutcome;
  appliedMs: number;
  trimmedMs: number;
  endsAt: number | null;
  /** this call is the one that applied it (false for a duplicate) */
  fresh: boolean;
}

/**
 * Grant one reward to one person, at most once for all time.
 */
export async function grantReward(
  deps: RewardsDeps,
  userId: string,
  g: Grant,
  meta: LedgerRow['meta'] = {}
): Promise<GrantDone> {
  const { store } = deps;
  const now = deps.now();
  const inserted = await store.insertLedger({
    key: g.key,
    userId,
    source: g.source,
    days: g.days,
    createdAt: now,
    status: 'pending',
    appliedMs: 0,
    endsAt: null,
    meta,
  });
  if (inserted === 'exists') {
    const prior = await store.getLedger(g.key);
    // finished before, or claimed for someone else: either way, not again
    if (!prior || prior.status !== 'pending' || prior.userId !== userId) {
      return { outcome: 'duplicate', appliedMs: 0, trimmedMs: 0, endsAt: null, fresh: false };
    }
    // a grant that died half-way: finish it below, exactly as if it were new
  }
  const base = await deps.baseEntitled(userId);
  for (let i = 0; i < ATTEMPTS; i++) {
    const acct = await ensureAccount(store, userId);
    if (acct.applied.includes(g.key)) {
      // applied by another caller (or by a run that died before writing the ledger)
      // only if still pending: the caller that applied it writes the real outcome, and must win
      await store.updateLedger(g.key, { status: 'applied' }, { onlyIfPending: true });
      return { outcome: 'duplicate', appliedMs: 0, trimmedMs: 0, endsAt: null, fresh: false };
    }
    const r = applyGrant(acct, g, { now: deps.now(), baseEntitled: base, cfg: deps.cfg });
    if (await store.casAccount(r.account, acct.version)) {
      await store.updateLedger(g.key, { status: r.outcome, appliedMs: r.appliedMs, endsAt: r.endsAt });
      if (r.appliedMs > 0) deps.changed?.(userId);
      return { outcome: r.outcome, appliedMs: r.appliedMs, trimmedMs: r.trimmedMs, endsAt: r.endsAt, fresh: true };
    }
  }
  throw new RewardsBusy();
}

/** Finish any grant to this person that a previous request started and did not complete. */
export async function reconcile(deps: RewardsDeps, userId: string): Promise<number> {
  const rows = await deps.store.listLedger(userId);
  let n = 0;
  for (const r of rows) {
    if (r.status !== 'pending') continue;
    const done = await grantReward(deps, userId, { key: r.key, source: r.source, days: r.days }, r.meta);
    if (done.fresh) n++;
  }
  return n;
}

export interface PromoState {
  /** promotional access is what entitles them right now */
  active: boolean;
  until: number | null;
  bankedMs: number;
  /** promotional time still to come, active plus banked (ms) */
  remainingMs: number;
}

const NO_PROMO: PromoState = { active: false, until: null, bankedMs: 0, remainingMs: 0 };

/**
 * What promotional access means for this person right now — and the writes
 * that keep it honest (start the bank when other access is gone, pause running
 * time while it is held, report an ending once).
 *
 * `base` may be passed when the caller already knows it (the plan resolver
 * does), to save asking twice.
 */
export async function resolvePromo(deps: RewardsDeps, userId: string, opts: { base?: boolean } = {}): Promise<PromoState> {
  const { store } = deps;
  const first = await store.getAccount(userId);
  if (!first) return NO_PROMO;
  if (first.applied.length) await reconcile(deps, userId).catch(() => 0);
  const base = opts.base ?? (await deps.baseEntitled(userId));
  for (let i = 0; i < ATTEMPTS; i++) {
    const acct = (await store.getAccount(userId)) ?? first;
    const now = deps.now();
    const r = resolveAccount(acct, { now, baseEntitled: base });
    if (!r.changed || (await store.casAccount(r.account, acct.version))) {
      if (r.changed) {
        deps.changed?.(userId);
        if (r.expired) await deps.track?.('rewards_promo_expired', {});
      }
      const a = r.account;
      return { active: r.promoActive, until: a.until, bankedMs: a.bankedMs, remainingMs: remainingMs(a, now) };
    }
  }
  // could not write: answer from what was read, which is right for this moment
  const now = deps.now();
  const r = resolveAccount(first, { now, baseEntitled: base });
  return { active: r.promoActive, until: r.account.until, bankedMs: r.account.bankedMs, remainingMs: remainingMs(r.account, now) };
}

/**
 * They became a paying member. Running promotional time pauses into the bank,
 * and — once, for somebody a reward ever reached — the conversion is recorded.
 * Stripe is not touched.
 */
export async function onPaidAccess(deps: RewardsDeps, userId: string): Promise<{ converted: boolean }> {
  const { store } = deps;
  const first = await store.getAccount(userId);
  if (!first) return { converted: false };
  await resolvePromo(deps, userId, { base: true });
  for (let i = 0; i < ATTEMPTS; i++) {
    const acct = await store.getAccount(userId);
    if (!acct) return { converted: false };
    const m = markConverted(acct, deps.now());
    if (!m.converted) return { converted: false };
    if (await store.casAccount(m.account, acct.version)) {
      await deps.track?.('rewards_promo_converted', {});
      return { converted: true };
    }
  }
  return { converted: false };
}

// ── the 5-Node Challenge ────────────────────────────────────────────

export const challengeKey = (userId: string) => `challenge:${userId}`;

export type ChallengeStatus =
  | { state: 'off' }
  /** they hold Socria One some other way — the challenge is for free accounts */
  | { state: 'member' }
  | { state: 'open'; progress: number; target: number; needsOwnWords: boolean; sessionId: string | null }
  | { state: 'done'; target: number; at: number; outcome: string; justNow: boolean };

export async function checkChallenge(
  deps: RewardsDeps,
  userId: string,
  loadSessions: () => Promise<ChallengeSession[]>
): Promise<ChallengeStatus> {
  const { cfg, store } = deps;
  if (!cfg.enabled) return { state: 'off' };
  const key = challengeKey(userId);
  const prior = await store.getLedger(key);
  if (prior && prior.status !== 'pending') {
    return { state: 'done', target: cfg.challenge.nodes, at: prior.createdAt, outcome: prior.status, justNow: false };
  }
  if (!prior && (await deps.baseEntitled(userId))) return { state: 'member' };
  const ev = evaluateChallenge(await loadSessions(), cfg.challenge);
  if (!ev.qualifies && !prior) {
    return { state: 'open', progress: ev.progress, target: ev.target, needsOwnWords: ev.needsOwnWords, sessionId: ev.sessionId };
  }
  const g = await grantReward(deps, userId, { key, source: 'challenge', days: cfg.challenge.days });
  if (g.fresh) {
    await deps.track?.('rewards_challenge_completed', {});
    if (g.appliedMs > 0) await deps.track?.('rewards_challenge_reward_granted', { kind: 'challenge', outcome: g.outcome });
  }
  const row = await store.getLedger(key);
  return { state: 'done', target: cfg.challenge.nodes, at: row?.createdAt ?? deps.now(), outcome: row?.status ?? g.outcome, justNow: g.fresh };
}

// ── Give 7, Get 7 ───────────────────────────────────────────────────

export const signupKey = (referredId: string) => `referral_signup:${referredId}`;
export const activationKey = (referredId: string) => `referral_activation:${referredId}`;

/** This person's code, made the first time it is asked for. */
export async function ensureCode(deps: RewardsDeps, userId: string): Promise<string> {
  const { store } = deps;
  const have = await store.getCode(userId);
  if (have) return have;
  for (let i = 0; i < 8; i++) {
    const code = makeCode(deps.random(8));
    const r = await store.createCode(userId, code);
    if (r === 'inserted') return code;
    if (r === 'user_has') {
      const again = await store.getCode(userId);
      if (again) return again;
    }
  }
  throw new Error('rewards: could not mint a referral code');
}

export type AttributionResult =
  | { ok: true; grant: GrantDone; referrerId: string }
  | { ok: false; reason: AttributionRefusal | 'off' | 'unknown_code' };

/**
 * A new account arrived through a link (or a Think Together invitation):
 * credit the person who brought them, and give the friend their seven days.
 */
export async function attributeReferral(
  deps: RewardsDeps,
  input: {
    userId: string;
    cookie: RefCookie;
    via: 'link' | 'invite';
    referred: { createdAt: number; emails: EmailFact[] };
    referrerEmails: (referrerId: string) => Promise<EmailFact[]>;
  }
): Promise<AttributionResult> {
  const { cfg, store } = deps;
  if (!cfg.enabled) return { ok: false, reason: 'off' };
  const referrerId = await store.ownerOfCode(input.cookie.code);
  if (!referrerId) return { ok: false, reason: 'unknown_code' };
  const existing = await store.getReferral(input.userId);
  const verdict = checkAttribution({
    referredId: input.userId,
    referrerId,
    referredCreatedAt: input.referred.createdAt,
    linkOpenedAt: input.cookie.at,
    now: deps.now(),
    referredEmails: input.referred.emails,
    referrerEmails: referrerId === input.userId ? [] : await input.referrerEmails(referrerId),
    alreadyReferred: !!existing,
    cfg: cfg.referral,
  });
  if (!verdict.ok) return verdict;
  const ins = await store.insertReferral({
    userId: input.userId,
    referrerId,
    code: input.cookie.code,
    via: input.via,
    status: 'signed_up',
    createdAt: deps.now(),
    activatedAt: null,
  });
  if (ins === 'exists') return { ok: false, reason: 'already_referred' };
  await deps.track?.('rewards_referral_signup_completed', { surface: input.via });
  const grant = await grantReward(deps, input.userId, { key: signupKey(input.userId), source: 'referral_signup', days: cfg.referral.signupDays }, { via: input.via });
  if (grant.fresh && grant.appliedMs > 0) await deps.track?.('rewards_referral_reward_granted', { kind: 'referral_signup', outcome: grant.outcome });
  return { ok: true, grant, referrerId };
}

export type ActivationStatus =
  | { state: 'none' }
  | { state: 'signed_up'; meaningful: number; needed: number }
  | { state: Exclude<ReferralStatus, 'signed_up'>; justNow: boolean };

/**
 * Has this (referred) person become active? If so — once — reward the person
 * who invited them, and only that person.
 */
export async function checkActivation(
  deps: RewardsDeps,
  userId: string,
  loadActivity: () => Promise<ActivitySession[]>
): Promise<ActivationStatus> {
  const { cfg, store } = deps;
  const ref = await store.getReferral(userId);
  if (!ref) return { state: 'none' };
  if (ref.status !== 'signed_up') return { state: ref.status, justNow: false };
  const prog = activationProgress(await loadActivity(), cfg.referral);
  if (!prog.reached) return { state: 'signed_up', meaningful: prog.meaningful, needed: cfg.referral.activationSessions };
  if (!ref.referrerId) {
    await store.moveReferral(userId, 'signed_up', { status: 'orphaned', activatedAt: deps.now() });
    return { state: 'orphaned', justNow: true };
  }
  // direct only: the person who invited THEM, and nobody above
  const g = await grantReward(deps, ref.referrerId, { key: activationKey(userId), source: 'referral_activation', days: cfg.referral.activationDays }, { via: ref.via });
  const ledger = await store.getLedger(activationKey(userId));
  const outcome = ledger?.status ?? g.outcome;
  const status: ReferralStatus = outcome === 'monthly_cap' ? 'capped' : outcome === 'bank_full' ? 'bank_full' : 'rewarded';
  const moved = await store.moveReferral(userId, 'signed_up', { status, activatedAt: deps.now() });
  if (moved) await deps.track?.('rewards_referral_activation_completed', { surface: ref.via });
  if (g.fresh && g.appliedMs > 0) await deps.track?.('rewards_referral_reward_granted', { kind: 'referral_activation', outcome: g.outcome });
  return { state: status, justNow: moved };
}

// ── what the person sees ────────────────────────────────────────────

export interface HistoryItem {
  source: RewardSource;
  /** days actually added (after the cap), rounded up */
  days: number;
  /** what became of it, in the words the panel uses */
  status: 'active' | 'banked' | 'expired' | 'capped' | 'bank_full' | 'pending';
  at: number;
  endsAt: number | null;
}

export interface RewardsStatus {
  enabled: boolean;
  promo: PromoState & { daysLeft: number; bankedDays: number };
  challenge: ChallengeStatus;
  referral: {
    code: string;
    rewardedThisMonth: number;
    monthlyCap: number;
    /** days earned from friends becoming active */
    earnedDays: number;
    /** friends who joined through them */
    joined: number;
    /** …of whom this many have not become active yet */
    waiting: number;
    /** how this person themselves arrived, if a friend invited them */
    invitedBy: 'link' | 'invite' | null;
    activation: ActivationStatus;
  };
  history: HistoryItem[];
  limits: { bankCapDays: number; challengeDays: number; signupDays: number; activationDays: number; challengeNodes: number };
}

export function historyOf(rows: LedgerRow[], promo: PromoState, now: number, dayMs: number): HistoryItem[] {
  return rows
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((r) => {
      let status: HistoryItem['status'];
      if (r.status === 'pending') status = 'pending';
      else if (r.status === 'monthly_cap') status = 'capped';
      else if (r.status === 'bank_full') status = 'bank_full';
      // banked time is spent in order once it starts: still banked while the bank holds any,
      // running while promotional access runs, used up after
      else if (r.status === 'banked' || r.status === 'applied') status = promo.bankedMs > 0 ? 'banked' : promo.active ? 'active' : 'expired';
      // a reward that went straight to active is used up when the window it extended to has passed
      else status = r.endsAt !== null && r.endsAt <= now ? 'expired' : 'active';
      return { source: r.source, days: daysOf(r.appliedMs, dayMs), status, at: r.createdAt, endsAt: r.endsAt };
    });
}

export async function rewardsStatus(
  deps: RewardsDeps,
  userId: string,
  loaders: { challengeSessions: () => Promise<ChallengeSession[]>; activity: () => Promise<ActivitySession[]> }
): Promise<RewardsStatus> {
  const { cfg, store } = deps;
  const now = deps.now();
  const code = await ensureCode(deps, userId);
  const activation = await checkActivation(deps, userId, loaders.activity);
  const challenge = await checkChallenge(deps, userId, loaders.challengeSessions);
  const promo = await resolvePromo(deps, userId);
  const acct = await store.getAccount(userId);
  const mine = await store.listReferralsBy(userId);
  const me = await store.getReferral(userId);
  const rows = await store.listLedger(userId);
  const earned = rows.filter((r) => r.source === 'referral_activation').reduce((n, r) => n + r.appliedMs, 0);
  return {
    enabled: cfg.enabled,
    promo: { ...promo, daysLeft: daysOf(Math.max(0, (promo.until ?? 0) - now), cfg.dayMs), bankedDays: daysOf(promo.bankedMs, cfg.dayMs) },
    challenge,
    referral: {
      code,
      rewardedThisMonth: acct ? referralsThisMonth(acct, now) : 0,
      monthlyCap: cfg.referral.monthlyCap,
      earnedDays: daysOf(earned, cfg.dayMs),
      joined: mine.length,
      waiting: mine.filter((r) => r.status === 'signed_up').length,
      invitedBy: me ? me.via : null,
      activation,
    },
    history: historyOf(rows, promo, now, cfg.dayMs),
    limits: {
      bankCapDays: cfg.bankCapDays,
      challengeDays: cfg.challenge.days,
      signupDays: cfg.referral.signupDays,
      activationDays: cfg.referral.activationDays,
      challengeNodes: cfg.challenge.nodes,
    },
  };
}
