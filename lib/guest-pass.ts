import 'server-only';
// lib/guest-pass.ts — A GUEST'S ONE LINE OF THINKING.
//
// Somebody signed out can use Logos 5 before making an account: one line of
// thinking and its map. There is no account to count against, so the one line
// of thinking is named in a signed, httpOnly cookie: claimed by the guest's
// first turn (app/api/logos/guest), and every guest turn after it — the reply
// (app/api/logos/chat) and the map (app/api/logos/map) — must be in that same
// line of thinking. A second one is refused with a way to sign up, and the
// first comes with them when they do (components/LogosApp.tsx carries it in).
//
// WHAT IT DOES NOT DO. A cleared cookie can claim again; what bounds a
// determined guest is the anonymous rate limit per address (lib/rate-limit.ts),
// as it always has for signed-out use. The pass is a product limit, not a
// security boundary: it names which conversation, and the browser holds a
// signature, never anything to reuse elsewhere.
//
// Signed with a key derived from CLERK_SECRET_KEY. With no server secret there
// is no pass, and a guest is asked to sign up instead (the same answer a
// guest got before this existed).

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const GUEST_COOKIE = 'socria_guest';
/** How long a guest's line of thinking stays theirs on this browser. */
export const GUEST_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** The cookie is read only by the routes a guest turn uses. */
export const GUEST_COOKIE_PATH = '/api/logos';

/** A session id as Logos 5 makes them (lib/logos-sessions.ts): never a dot, so it cannot be confused with the pass's own fields. */
const SESSION_ID = /^[A-Za-z0-9_-]{1,120}$/;
export const isGuestSessionId = (v: unknown): v is string => typeof v === 'string' && SESSION_ID.test(v);

function key(): Buffer | null {
  const secret = (process.env.CLERK_SECRET_KEY ?? '').trim();
  return secret ? createHash('sha256').update(`socria.guest.v1|${secret}`, 'utf8').digest() : null;
}

/** A pass naming this line of thinking, good from `now`; null when this deployment cannot sign one. */
export function issueGuestPass(sessionId: string, now: number): string | null {
  const k = key();
  if (!k || !isGuestSessionId(sessionId)) return null;
  const body = `g.${sessionId}.${now + GUEST_TTL_MS}`;
  return `${body}.${createHmac('sha256', k).update(body, 'utf8').digest('base64url')}`;
}

/** The line of thinking a pass names, now; null for anything malformed, forged or late. */
export function guestSession(value: unknown, now: number): string | null {
  const k = key();
  if (!k || typeof value !== 'string' || value.length > 300) return null;
  const parts = value.split('.');
  if (parts.length !== 4 || parts[0] !== 'g' || !isGuestSessionId(parts[1])) return null;
  const until = Number(parts[2]);
  if (!Number.isFinite(until) || until <= now) return null;
  const want = createHmac('sha256', k).update(`${parts[0]}.${parts[1]}.${parts[2]}`, 'utf8').digest();
  const got = Buffer.from(parts[3], 'base64url');
  return got.length === want.length && timingSafeEqual(got, want) ? parts[1] : null;
}

export type GuestClaim =
  | { ok: true; pass: string | null }
  | { ok: false; why: 'unavailable' | 'bad-session' | 'other-session' };

/**
 * A guest asking to think in `sessionId`. Theirs already: yes, nothing new to
 * set. No line of thinking yet: yes, and the pass to set. Another one already
 * theirs: no — one line of thinking until they sign up.
 */
export function claimGuest(value: unknown, sessionId: unknown, now: number): GuestClaim {
  if (!key()) return { ok: false, why: 'unavailable' };
  if (!isGuestSessionId(sessionId)) return { ok: false, why: 'bad-session' };
  const held = guestSession(value, now);
  if (held === sessionId) return { ok: true, pass: null };
  if (held) return { ok: false, why: 'other-session' };
  return { ok: true, pass: issueGuestPass(sessionId, now) };
}

/** May this guest turn go ahead: is it in the line of thinking their pass names? */
export function guestMay(value: unknown, sessionId: unknown, now: number): boolean {
  return isGuestSessionId(sessionId) && guestSession(value, now) === sessionId;
}

/** What a guest is told when a turn is refused: what the limit is, and that their work comes with them. */
export const GUEST_LIMIT = 'Guests get one line of thinking and its map. Sign up free to start another — this one comes with you.';
