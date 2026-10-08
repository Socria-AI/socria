'use client';
// components/rewards/useRewards.ts
//
// Socria Rewards as the surfaces see it — one answer, from the server.
//
// Progress on the 5-Node Challenge, the referral link, promotional time: all
// of it comes from POST /api/rewards, which reads the person's stored maps and
// conversations and decides there. Nothing here counts nodes or grants
// anything; a number on screen is a number the server said.
//
// SHARED. The account sheet and the Logos chip may both be mounted; one
// request serves both (an in-flight request is reused, and an answer younger
// than a few seconds is reused), and every answer is broadcast so a component
// that did not ask still shows what the other one learned.
//
// LIVE ENOUGH. Logos announces each saved session ('socria:saved'); a quiet
// moment after one, the answer is asked for again — so "3/5" becomes "4/5" a
// few seconds after the map grew, from the map as the server holds it.

import { useCallback, useEffect, useRef, useState } from 'react';

export interface RewardsHistoryItem {
  source: 'challenge' | 'referral_signup' | 'referral_activation';
  days: number;
  status: 'active' | 'banked' | 'expired' | 'capped' | 'bank_full' | 'pending';
  at: number;
  endsAt: number | null;
}

export type RewardsChallenge =
  | { state: 'off' }
  | { state: 'member' }
  | { state: 'open'; progress: number; target: number; needsOwnWords: boolean; sessionId: string | null }
  | { state: 'done'; target: number; at: number; outcome: string; justNow: boolean };

export interface RewardsView {
  enabled: boolean;
  unavailable?: boolean;
  promo?: { active: boolean; until: number | null; bankedMs: number; remainingMs: number; daysLeft: number; bankedDays: number };
  challenge?: RewardsChallenge;
  referral?: {
    code: string;
    rewardedThisMonth: number;
    monthlyCap: number;
    earnedDays: number;
    joined: number;
    waiting: number;
    invitedBy: 'link' | 'invite' | null;
  };
  history?: RewardsHistoryItem[];
  limits?: { bankCapDays: number; challengeDays: number; signupDays: number; activationDays: number; challengeNodes: number };
  link?: string;
  invited?: { ok: true; days: number } | { ok: false; reason: string };
}

const EVENT = 'socria:rewards';
/** Fired when something a reward did may have changed what the person holds. */
export const PLAN_CHANGED = 'socria:plan-changed';
/** Fired by Logos when a session has been saved to the server. */
export const SESSION_SAVED = 'socria:saved';

let inflight: Promise<RewardsView | null> | null = null;
let last: { at: number; v: RewardsView } | null = null;
const FRESH_MS = 4000;

async function ask(force: boolean): Promise<RewardsView | null> {
  if (!force && last && Date.now() - last.at < FRESH_MS) return last.v;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch('/api/rewards', { method: 'POST', cache: 'no-store' });
      if (!res.ok) return null;
      const v = (await res.json()) as RewardsView;
      const prev = last?.v;
      last = { at: Date.now(), v };
      window.dispatchEvent(new CustomEvent<RewardsView>(EVENT, { detail: v }));
      const promoFlipped = !!prev?.promo?.active !== !!v.promo?.active;
      const justEarned = (v.challenge?.state === 'done' && v.challenge.justNow) || v.invited?.ok === true;
      if (promoFlipped || justEarned) window.dispatchEvent(new Event(PLAN_CHANGED));
      return v;
    } catch {
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function useRewards(opts: { enabled: boolean }): { view: RewardsView | null; refresh: () => void } {
  const [view, setView] = useState<RewardsView | null>(() => last?.v ?? null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(() => {
    void ask(true).then((v) => v && setView(v));
  }, []);

  useEffect(() => {
    if (!opts.enabled) return;
    let live = true;
    void ask(false).then((v) => live && v && setView(v));
    const onAnswer = (e: Event) => setView((e as CustomEvent<RewardsView>).detail);
    // a saved map may have grown: ask again once things are quiet
    const onSaved = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void ask(true), 2500);
    };
    window.addEventListener(EVENT, onAnswer);
    window.addEventListener(SESSION_SAVED, onSaved);
    return () => {
      live = false;
      window.removeEventListener(EVENT, onAnswer);
      window.removeEventListener(SESSION_SAVED, onSaved);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [opts.enabled]);

  return { view: opts.enabled ? view : null, refresh };
}

/** Per-browser memory for the surfaces' own manners — never anything the server decides. */
export function readFlag(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function writeFlag(key: string, v: string): void {
  try {
    localStorage.setItem(key, v);
  } catch {}
}

export const CHIP_HIDDEN_KEY = 'socria.rewards.chip.v1';
export const DONE_SEEN_KEY = 'socria.rewards.done.v1';
export const VIEWED_KEY = 'socria.rewards.viewed.v1';
export const STARTED_KEY = 'socria.rewards.started.v1';
