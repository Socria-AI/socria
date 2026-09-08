// lib/lifecycle.ts
//
// The few emails Socria sends on its own, and the rules for when.
//
// THE PRINCIPLE, before anything else: lifecycle emails are NOT One prompts.
// docs/ONE-PROMPTS.md says One is mentioned only because of something the
// person did — never because time passed, never because they are new. An
// email that arrives three days after someone's first session arrives
// because time passed. So the day-3 and day-7 notes say nothing about One at
// all; they say the map is where it was left, which is true and is the only
// thing worth saying. Exactly two kinds mention One: `welcome-one`, sent to
// someone who has just become a member, and `limit-chats`, which repeats the
// boundary's own two sentences (REACHED + OFFERS from lib/entitlements.ts)
// verbatim, a day after the person ran into it. Nothing else says One, and
// the suite checks that it stays that way.
//
// The second rule is as firm: no conversation content, no titles, ever. An
// email is copied, forwarded, and read over shoulders. A session id is not
// content — it is a pointer — and it is the most an email may carry.
//
// This module is pure: no React, no network, no database. The provider is in
// lib/email.ts, the ledger in lib/lifecycle-store.ts, the schedule in
// app/api/cron/lifecycle/route.ts. Everything here can be tested with a
// clock and a string.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { boundaryNote } from './entitlements';
import type { Plan } from './socria-one';
import type { Surface } from './checkout-attribution';

/** The emails that exist. Adding one is a deliberate act; read the header. */
export const LIFECYCLE_KINDS = ['welcome-one', 'limit-chats', 'day-3', 'day-7'] as const;
export type LifecycleKind = (typeof LIFECYCLE_KINDS)[number];

/**
 * The opt-out lives in the same ledger table as the sends, under this kind,
 * so any database that can send can also record a refusal — no second
 * migration between a person saying "stop" and it being honoured.
 */
export const UNSUBSCRIBED_KIND = 'unsubscribed';

export function isLifecycleKind(v: unknown): v is LifecycleKind {
  return typeof v === 'string' && (LIFECYCLE_KINDS as readonly string[]).includes(v);
}

export const DAY_MS = 86_400_000;

/**
 * How long someone must have been away before a day-N note may go. A note
 * that lands while the person is still working reads as noise; a day of
 * quiet is the least that makes "your map is still there" worth saying.
 */
export const QUIET_MS = DAY_MS;

/**
 * How long after the free boundary refused a new line of thinking the
 * limit-chats note waits. The refusal itself already carried these two
 * sentences on screen; repeating them by email within the hour would be the
 * nag the product promises not to be.
 */
export const LIMIT_DELAY_MS = DAY_MS;

/** The day each dated note belongs to, counted from the first activity. */
export const DAY_OF: Record<'day-3' | 'day-7', number> = { 'day-3': 3, 'day-7': 7 };

export function isDayKind(kind: LifecycleKind): kind is 'day-3' | 'day-7' {
  return kind === 'day-3' || kind === 'day-7';
}

/**
 * The window of FIRST-activity times a day-N candidate must fall in, as the
 * cron asks the database: first activity in [from, to) means the person is
 * between N and N+1 days in. Half-open so two consecutive days never share a
 * candidate.
 */
export function dayWindow(kind: 'day-3' | 'day-7', now: number): { from: number; to: number } {
  const n = DAY_OF[kind];
  return { from: now - (n + 1) * DAY_MS, to: now - n * DAY_MS };
}

// ── the decision ────────────────────────────────────────────────────

export interface LifecycleInput {
  kind: LifecycleKind;
  plan: Plan;
  /** the person has said stop */
  unsubscribed: boolean;
  /** this kind has already gone to this person — ever */
  alreadySent: boolean;
  /** when their first conversation was made, ms; null when there is none */
  firstSeenAt?: number | null;
  /** when anything of theirs last changed, ms; null when unknown */
  lastSeenAt?: number | null;
  /** when the free boundary refused a new line of thinking, ms (limit-chats) */
  refusedAt?: number | null;
  now: number;
}

export type SkipReason =
  | 'unsubscribed'
  | 'already-sent'
  | 'member'
  | 'not-member'
  | 'no-activity'
  | 'too-early'
  | 'too-late'
  | 'not-quiet'
  | 'no-refusal';

export type LifecycleDecision = { send: true } | { send: false; reason: SkipReason };

const skip = (reason: SkipReason): LifecycleDecision => ({ send: false, reason });

/**
 * Whether one email may go to one person right now.
 *
 * The order is deliberate. A refusal comes first because nothing overrides
 * it — not a welcome, not a boundary. "Already sent" comes second because
 * every kind goes at most once per person, ever: there is no second day-3,
 * and a second welcome would mean the first was not one.
 *
 * Then the kind's own rule:
 *   day-N        only inside [N, N+1) days after first activity, only after
 *                a full day of quiet, and never to a member — a member does
 *                not need to be told their map is still there, and the
 *                membership is proof they know.
 *   limit-chats  only a day or more after the refusal, and only while they
 *                are still free: if they joined in the meantime the boundary
 *                no longer exists, and an email about it would be untrue.
 *   welcome-one  only to a member. A welcome that reaches someone whose
 *                payment did not land is a promise the product cannot keep.
 */
export function decideLifecycle(input: LifecycleInput): LifecycleDecision {
  const { kind, plan, now } = input;
  if (input.unsubscribed) return skip('unsubscribed');
  if (input.alreadySent) return skip('already-sent');

  if (kind === 'welcome-one') {
    return plan === 'one' ? { send: true } : skip('not-member');
  }

  if (kind === 'limit-chats') {
    if (plan === 'one') return skip('member');
    const refusedAt = input.refusedAt ?? null;
    if (refusedAt === null) return skip('no-refusal');
    if (now - refusedAt < LIMIT_DELAY_MS) return skip('too-early');
    return { send: true };
  }

  // day-3 / day-7
  if (plan === 'one') return skip('member');
  const first = input.firstSeenAt ?? null;
  if (first === null) return skip('no-activity');
  const n = DAY_OF[kind];
  const age = now - first;
  if (age < n * DAY_MS) return skip('too-early');
  if (age >= (n + 1) * DAY_MS) return skip('too-late');
  const last = input.lastSeenAt ?? null;
  if (last === null || now - last < QUIET_MS) return skip('not-quiet');
  return { send: true };
}

// ── dates and links ─────────────────────────────────────────────────

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * When the monthly counters start again: the first of next month, in UTC,
 * because that is the month lib/usage.ts keys them by. Rendered as a plain
 * date ("1 October 2026") rather than a countdown — the email is telling
 * someone a fact about the calendar, not how long they have to wait.
 */
export function resetDateFor(now: number): string {
  const d = new Date(now);
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  return `1 ${MONTHS[next.getUTCMonth()]} ${next.getUTCFullYear()}`;
}

/** The query key an email link carries so checkout can attribute to it. */
export const VIA_PARAM = 'via';

/**
 * A link into the product that says which email it came from. `via` is the
 * kind and nothing more — the client stashes it and sends it as `source` at
 * checkout, where it is re-validated against the kinds above.
 */
export function viaLink(
  base: string,
  path: string,
  kind: LifecycleKind,
  params: Record<string, string> = {}
): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  q.set(VIA_PARAM, kind);
  return `${base.replace(/\/$/, '')}${path}?${q.toString()}`;
}

export interface LinkContext {
  base: string;
  /** the most recent Logos session, for the day-N notes; an id, never a title */
  sessionId?: string | null;
  /** the surface checkout was opened from, for the welcome */
  surface?: Surface | null;
}

/** Where each email's one link goes. */
export function lifecycleLink(kind: LifecycleKind, ctx: LinkContext): string {
  switch (kind) {
    case 'day-3':
    case 'day-7':
      return viaLink(ctx.base, '/chat', kind, ctx.sessionId ? { s: ctx.sessionId } : {});
    case 'welcome-one':
      // Core is the one surface where the welcome should not switch models
      // under the person; everywhere else, One is Logos.
      return ctx.surface === 'core'
        ? viaLink(ctx.base, '/chat', kind)
        : viaLink(ctx.base, '/chat', kind, { model: 'logos' });
    case 'limit-chats':
      return viaLink(ctx.base, '/chat', kind, { model: 'logos' });
  }
}

/** The unsubscribe address, with its token. */
export function unsubscribeUrl(base: string, userId: string, token: string): string {
  const q = new URLSearchParams({ u: userId, t: token });
  return `${base.replace(/\/$/, '')}/api/email/unsubscribe?${q.toString()}`;
}

// ── the unsubscribe token ───────────────────────────────────────────
//
// An unsubscribe link has to work without signing in — it is pressed from a
// mail client, often on a phone that has never seen Socria — and it must not
// let anyone unsubscribe anyone else by guessing an id. An HMAC over the id
// does both: the link carries the id in the open and a signature only the
// server can make.

const TOKEN_SCOPE = 'unsub:v1:';

export function unsubscribeToken(userId: string, secret: string): string {
  return createHmac('sha256', secret).update(`${TOKEN_SCOPE}${userId}`).digest('hex');
}

/**
 * Constant-time. The length check comes first because timingSafeEqual
 * throws on unequal lengths, and a thrown error on a public GET is a way
 * to find out how long the right answer is.
 */
export function verifyUnsubscribeToken(userId: unknown, token: unknown, secret: string): boolean {
  if (typeof userId !== 'string' || !userId || typeof token !== 'string' || !secret) return false;
  const want = Buffer.from(unsubscribeToken(userId, secret), 'utf8');
  const got = Buffer.from(token, 'utf8');
  if (want.length !== got.length) return false;
  return timingSafeEqual(want, got);
}

// ── the copy ────────────────────────────────────────────────────────

export interface EmailCopy {
  subject: string;
  /** plain text — the version that is read most, so it comes first */
  text: string;
  /** the same words, in the least HTML that renders them */
  html: string;
}

export interface CopyContext {
  /** the email's one link into the product (see lifecycleLink) */
  link: string;
  /** where "stop these notes" goes */
  unsubscribeUrl: string;
  /** limit-chats only: when the free counters start again */
  resetDate?: string;
}

const SIGN_OFF = '— Socria';

/**
 * The footer every note carries. Says why it arrived and how to stop it, in
 * one line, because a person who did not expect an email deserves both
 * answers before anything else.
 */
const FOOTER = 'You are getting this because you have a Socria account.';

/** What the link is called when it is a button rather than a URL. */
const LINK_LABEL: Record<LifecycleKind, string> = {
  'day-3': 'Open your maps',
  'day-7': 'Open your maps',
  'welcome-one': 'Open Socria',
  'limit-chats': 'Open Logos',
};

/**
 * The words, per kind. Each is a subject and a few short paragraphs; the
 * link and the sign-off are added by lifecycleCopy so no kind can forget
 * either.
 */
function paragraphs(kind: LifecycleKind, ctx: CopyContext): { subject: string; body: string[] } {
  switch (kind) {
    case 'day-3':
      return {
        subject: 'Your maps are where you left them',
        body: [
          'Whatever you were thinking through is still on the map, exactly as you left it. Pick it up whenever it’s useful.',
        ],
      };
    case 'day-7':
      return {
        subject: 'A week on',
        body: ['The map’s still there.'],
      };
    case 'welcome-one':
      // What One DOES, in the /one voice: capabilities of a thinking
      // environment, never quantities. And the reassurance that matters
      // most to someone who has just paid — nothing they made has moved.
      return {
        subject: 'Socria One is open',
        body: [
          'Socria One is open.',
          'Every line of thinking you begin now stays open as far as it goes. The map keeps developing past where the free tier held it, with every lens onto it. Research runs whenever a question needs it. And Socria remembers how you reason between lines of thinking, and carries it into Logos.',
          'Nothing you have already made changes. It is all still yours, and still where you left it.',
        ],
      };
    case 'limit-chats':
      // The boundary's own two sentences, verbatim — the same words the
      // person saw on screen a day ago, so the email is a reminder of a
      // fact and not a second pitch. Then the calendar.
      return {
        subject: 'Your free lines of thinking for this month',
        body: [
          boundaryNote('chats'),
          `Your free lines of thinking open again on ${ctx.resetDate ?? 'the first of next month'}.`,
        ],
      };
  }
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Both renderings of one email. */
export function lifecycleCopy(kind: LifecycleKind, ctx: CopyContext): EmailCopy {
  const { subject, body } = paragraphs(kind, ctx);

  const text = [...body, ctx.link, SIGN_OFF, '', `${FOOTER} Stop these notes: ${ctx.unsubscribeUrl}`].join(
    '\n\n'
  );

  const style =
    'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;' +
    'color:#1d1d1f;max-width:34em;margin:2em auto;padding:0 1em;line-height:1.55;font-size:16px';
  const html =
    `<!doctype html><html><body style="${style}">` +
    body.map((p) => `<p>${escapeHtml(p)}</p>`).join('') +
    `<p><a href="${escapeHtml(ctx.link)}">${escapeHtml(LINK_LABEL[kind])}</a></p>` +
    `<p>${escapeHtml(SIGN_OFF)}</p>` +
    `<p style="color:#6e6e73;font-size:14px">${escapeHtml(FOOTER)} ` +
    `<a href="${escapeHtml(ctx.unsubscribeUrl)}" style="color:#6e6e73">Stop these notes</a>.</p>` +
    '</body></html>';

  return { subject, text, html };
}
