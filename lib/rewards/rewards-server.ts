// lib/rewards/rewards-server.ts
//
// Socria Rewards, wired to the real world: the database, the identity
// provider, the plan resolver, analytics. The routes use this; the rules and
// the service it feeds (rewards-service.ts) know none of it.

import 'server-only';
import { randomBytes } from 'node:crypto';
import { clerkClient } from '@clerk/nextjs/server';
import type { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../supabase';
import { trackServer } from '../analytics-server';
import { baseEntitledForRewards, forgetPlanMemo } from '../socria-one-server';
import { isProduction } from '../environment';
import { rewardsConfig, type RewardsConfig } from './rewards-config';
import { supabaseRewardsStore } from './supabase-rewards-store';
import { ensureCode, onPaidAccess, resolvePromo, type RewardsDeps } from './rewards-service';
import { REF_COOKIE, decodeRefCookie, encodeRefCookie, type EmailFact, type RefCookie, type ActivitySession } from './referral-rule';
import type { ChallengeSession } from './challenge-rule';

export function rewardsDeps(req?: { headers: Headers }): RewardsDeps {
  return {
    store: supabaseRewardsStore(),
    cfg: rewardsConfig(),
    now: Date.now,
    baseEntitled: baseEntitledForRewards,
    track: (event, props) => trackServer(event, props ?? {}, req),
    changed: forgetPlanMemo,
    random: (n) => randomBytes(n),
  };
}

/** The person's Logos sessions, newest first, as the server stored them. */
export async function loadChallengeSessions(userId: string, cfg: RewardsConfig): Promise<ChallengeSession[]> {
  const { data, error } = await supabaseAdmin()
    .from('conversations')
    .select('id, map, messages')
    .eq('user_id', userId)
    .eq('kind', 'logos')
    .order('updated_at', { ascending: false })
    .limit(cfg.challenge.scanSessions);
  if (error) throw error;
  return ((data ?? []) as { id: string; map: unknown; messages: unknown }[]).map((r) => ({
    id: String(r.id),
    map: r.map && typeof r.map === 'object' ? (r.map as ChallengeSession['map']) : null,
    messages: Array.isArray(r.messages) ? (r.messages as ChallengeSession['messages']) : [],
  }));
}

/** The person's conversations (Core and Logos), oldest first, for "has become active". */
export async function loadActivity(userId: string): Promise<ActivitySession[]> {
  const { data, error } = await supabaseAdmin()
    .from('conversations')
    .select('created_at, messages')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(40);
  if (error) throw error;
  return ((data ?? []) as { created_at: unknown; messages: unknown }[]).map((r) => ({
    createdAt: r.created_at ? new Date(String(r.created_at)).getTime() : 0,
    messages: Array.isArray(r.messages) ? (r.messages as ActivitySession['messages']) : [],
  }));
}

/** What the identity provider knows that a referral needs: when the account was made, and its addresses. */
export async function identityFacts(userId: string): Promise<{ createdAt: number; emails: EmailFact[] } | null> {
  try {
    const u = await clerkClient().users.getUser(userId);
    return {
      createdAt: typeof u.createdAt === 'number' ? u.createdAt : new Date(u.createdAt as unknown as string).getTime(),
      emails: (u.emailAddresses ?? []).map((e) => ({ address: e.emailAddress, verified: e.verification?.status === 'verified' })),
    };
  } catch {
    return null;
  }
}

export async function emailsOf(userId: string): Promise<EmailFact[]> {
  return (await identityFacts(userId))?.emails ?? [];
}

// ── the link's cookie ───────────────────────────────────────────────

export function readRefCookie(req: NextRequest, cfg: RewardsConfig): RefCookie | null {
  return decodeRefCookie(req.cookies.get(REF_COOKIE)?.value, Date.now(), cfg.referral.cookieDays);
}

/**
 * Remember who invited this browser. FIRST LINK WINS: a fresh cookie already
 * holding someone's code is not replaced, so a later link cannot take a friend
 * from the person who brought them.
 */
export function setRefCookie(req: NextRequest, res: NextResponse, code: string, via: 'link' | 'invite', cfg: RewardsConfig): boolean {
  if (readRefCookie(req, cfg)) return false;
  res.cookies.set(REF_COOKIE, encodeRefCookie({ code, at: Date.now(), ...(via === 'invite' ? { via } : {}) }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction(),
    path: '/',
    maxAge: cfg.referral.cookieDays * 86_400,
  });
  return true;
}

export function clearRefCookie(res: NextResponse): void {
  res.cookies.set(REF_COOKIE, '', { httpOnly: true, sameSite: 'lax', secure: isProduction(), path: '/', maxAge: 0 });
}

/**
 * A signed-out person opened an invitation (a Think Together room, a share
 * link, code or email): remember the inviter as their referrer, should they
 * go on to make an account. Best effort and bounded — an invitation must open
 * whether or not this works.
 */
export async function rememberInviter(req: NextRequest, res: NextResponse, inviterId: string | null): Promise<void> {
  const cfg = rewardsConfig();
  if (!cfg.enabled || !inviterId) return;
  try {
    const code = await ensureCode(rewardsDeps(req), inviterId);
    if (setRefCookie(req, res, code, 'invite', cfg)) await trackServer('rewards_referral_link_opened', { surface: 'invite' }, req);
  } catch {
    // no rewards tables yet, or a hiccup: the invitation carries no referral, and that is all
  }
}

/**
 * Billing changed (the Stripe webhook). Paid access began: running reward time
 * pauses into the bank and — once — the conversion is recorded. Paid access
 * ended: banked reward time may start. Never throws; Stripe is never called.
 */
export async function rewardsAfterBilling(userId: string, entitledNow: boolean, req?: { headers: Headers }): Promise<void> {
  if (!rewardsConfig().enabled) return;
  try {
    const deps = rewardsDeps(req);
    if (entitledNow) await onPaidAccess(deps, userId);
    else await resolvePromo(deps, userId);
  } catch {
    // no rewards tables, or a hiccup: the next visit resolves it the same way
  }
}
