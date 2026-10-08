// lib/rewards/referral-rule.ts
//
// GIVE 7, GET 7 — the rules, with nothing else in them.
//
//   Invite a friend to Socria. Your friend gets seven days of Socria One, and
//   you earn seven days when they become an active user.
//
// What this module decides, and nothing more:
//
//   THE CODE. Eight characters from an alphabet with nothing to misread
//   (no 0/O, 1/I/L, U), so a code read aloud or retyped from a screenshot still
//   works. It names no one: a code never contains or reveals a user id.
//
//   THE LINK'S MEMORY. Opening /r/<code> leaves a cookie holding the code and
//   when the link was opened. First link wins: a later link does not take a
//   friend from the person who brought them.
//
//   WHO IS A NEW FRIEND. Only a genuinely new account is a referred sign-up:
//   created within a few days of being attributed, AFTER the link was opened
//   (an existing account that opens a link later is not new), with a verified
//   email address that is not a disposable inbox, not the referrer's own
//   address in disguise (Gmail dots, +tags), not the referrer themselves, and
//   not already referred by anyone. Each refusal has a reason, so a support
//   question has an answer.
//
//   WHAT "ACTIVE" MEANS. Two meaningful sessions: conversations — Core or
//   Logos — where the person wrote at least two messages of their own words
//   (a starting card sent unchanged is not their words), a dozen words in all,
//   and Socria answered. Page visits, opening Logos, and empty sessions never
//   count.
//
// DIRECT ONLY. A reward goes to the person who invited this friend, and to no
// one above them: when B (invited by A) invites C, C's activity rewards B,
// never A. Chains are encouraged; commissions are not a thing here.
//
// PURE.

import { isStarterText } from './challenge-rule';
import type { RewardsConfig } from './rewards-config';

export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
export const CODE_LENGTH = 8;
export const REF_COOKIE = 'socria_ref';

/** A new code from random bytes (crypto, supplied by the caller). */
export function makeCode(bytes: ArrayLike<number>): string {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[(bytes[i] ?? 0) % CODE_ALPHABET.length];
  return out;
}

/** A code as somebody typed or pasted it, or null. Forgiving of case, spaces and dashes. */
export function normalizeReferralCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.toUpperCase().replace(/[\s-]/g, '');
  if (s.length !== CODE_LENGTH) return null;
  for (const ch of s) if (!CODE_ALPHABET.includes(ch)) return null;
  return s;
}

export interface RefCookie {
  code: string;
  /** when the link was first opened (ms) */
  at: number;
  /** absent for a referral link; 'invite' when it came with a Think Together invitation */
  via?: 'invite';
}

export function encodeRefCookie(c: RefCookie): string {
  return `${c.code}.${Math.floor(c.at).toString(36)}${c.via === 'invite' ? '.i' : ''}`;
}

/** The cookie, if it is one we wrote and still fresh; otherwise null. */
export function decodeRefCookie(raw: unknown, now: number, maxAgeDays: number): RefCookie | null {
  if (typeof raw !== 'string' || raw.length > 40) return null;
  const [codeRaw, atRaw, viaRaw] = raw.split('.');
  const code = normalizeReferralCode(codeRaw);
  const at = atRaw && /^[0-9a-z]{1,12}$/.test(atRaw) ? parseInt(atRaw, 36) : NaN;
  if (!code || !Number.isFinite(at)) return null;
  if (at > now + 5 * 60_000) return null; // from the future: not ours
  if (now - at > maxAgeDays * 86_400_000) return null;
  return viaRaw === 'i' ? { code, at, via: 'invite' } : { code, at };
}

/**
 * An email address reduced to the mailbox it delivers to: case, a +tag, and
 * Gmail's ignored dots. Two addresses that normalise alike are one person as
 * far as a referral is concerned.
 */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase();
  const at = s.lastIndexOf('@');
  if (at < 1 || at === s.length - 1) return null;
  let local = s.slice(0, at);
  let domain = s.slice(at + 1);
  if (domain === 'googlemail.com') domain = 'gmail.com';
  local = local.split('+')[0];
  if (domain === 'gmail.com') local = local.replace(/\./g, '');
  if (!local) return null;
  return `${local}@${domain}`;
}

export interface EmailFact {
  address: string;
  verified: boolean;
}

export type AttributionRefusal =
  | 'self' // the code is the person's own
  | 'already_referred' // this account already has a referrer
  | 'not_new' // the account is older than a new sign-up can be
  | 'joined_before_link' // the account existed before the link was opened
  | 'unverified_email' // no verified email address on the account
  | 'blocked_domain' // a disposable inbox
  | 'same_person'; // the referrer's own address, in another form

/**
 * May this account be credited to this referrer? Every check that can be made
 * from facts the server holds, in one place, each with its reason.
 */
export function checkAttribution(input: {
  referredId: string;
  referrerId: string;
  referredCreatedAt: number;
  linkOpenedAt: number;
  now: number;
  referredEmails: EmailFact[];
  referrerEmails: EmailFact[];
  alreadyReferred: boolean;
  cfg: Pick<RewardsConfig['referral'], 'newAccountHours' | 'blockedDomains'>;
}): { ok: true } | { ok: false; reason: AttributionRefusal } {
  const { cfg } = input;
  if (input.referredId === input.referrerId) return { ok: false, reason: 'self' };
  if (input.alreadyReferred) return { ok: false, reason: 'already_referred' };
  if (!(input.now - input.referredCreatedAt <= cfg.newAccountHours * 3_600_000)) return { ok: false, reason: 'not_new' };
  // ten minutes of clock skew between our server and the identity provider's
  if (input.linkOpenedAt > input.referredCreatedAt + 10 * 60_000) return { ok: false, reason: 'joined_before_link' };
  const verified = input.referredEmails.filter((e) => e.verified).map((e) => normalizeEmail(e.address)).filter(Boolean) as string[];
  if (!verified.length) return { ok: false, reason: 'unverified_email' };
  const domainOf = (e: string) => e.slice(e.lastIndexOf('@') + 1);
  if (verified.every((e) => cfg.blockedDomains.includes(domainOf(e)))) return { ok: false, reason: 'blocked_domain' };
  const theirs = new Set(input.referrerEmails.map((e) => normalizeEmail(e.address)).filter(Boolean) as string[]);
  const allMine = input.referredEmails.map((e) => normalizeEmail(e.address)).filter(Boolean) as string[];
  if (allMine.some((e) => theirs.has(e))) return { ok: false, reason: 'same_person' };
  return { ok: true };
}

export interface ActivitySession {
  /** when the conversation was started (ms) */
  createdAt: number;
  messages: { role: string; content: string }[];
}

/** A session that shows real use: their own words, more than once, and Socria answered. */
export function meaningfulSession(
  s: ActivitySession,
  cfg: Pick<RewardsConfig['referral'], 'sessionUserTurns' | 'sessionWords'>
): boolean {
  let turns = 0;
  let words = 0;
  let replied = false;
  for (const m of s.messages ?? []) {
    if (!m || typeof m.content !== 'string') continue;
    if (m.role === 'assistant') {
      if (m.content.trim()) replied = true;
      continue;
    }
    if (m.role !== 'user' || isStarterText(m.content)) continue;
    const n = (m.content.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
    if (n > 0) {
      turns++;
      words += n;
    }
  }
  return replied && turns >= cfg.sessionUserTurns && words >= cfg.sessionWords;
}

/** How far a referred person is toward "active". */
export function activationProgress(
  sessions: ActivitySession[],
  cfg: Pick<RewardsConfig['referral'], 'sessionUserTurns' | 'sessionWords' | 'activationSessions' | 'activationDistinctDays'>
): { meaningful: number; days: number; reached: boolean } {
  const good = (sessions ?? []).filter((s) => meaningfulSession(s, cfg));
  const days = new Set(good.map((s) => new Date(s.createdAt).toISOString().slice(0, 10))).size;
  return {
    meaningful: good.length,
    days,
    reached: good.length >= cfg.activationSessions && days >= cfg.activationDistinctDays,
  };
}
