import 'server-only';
// lib/dashboard/codes.ts
//
// THE DEVELOPER DASHBOARD'S TWO-STEP CODE: a second way in, beside the
// admin list in lib/dashboard/gate.ts, for opening the page without naming
// an account.
//
// The codes live in the environment and nowhere else —
// SOCRIA_DASHBOARD_CODE_1 and SOCRIA_DASHBOARD_CODE_2 — because this
// repository is public, and a code written here is a code published (see
// lib/access-codes-server.ts for the time that happened). Both must be set;
// either unset and the codes open nothing, and the page is the same 404 it
// is for anyone not on the admin list.
//
// How a visit goes: the first code, right, earns a signed note, good for ten
// minutes, that step one is done; the second code is only accepted beside
// that note, and earns the pass. A wrong second code clears the note from the
// browser, so a person starts over. (The note is stateless, so a copy kept
// aside stays valid for its ten minutes; what bounds guessing at either code
// is the 'code' rate limit on the route, a handful of tries a minute.) The
// browser holds signed, httpOnly cookies, never a code. They are signed with a key derived
// from both codes and a server secret, so changing either code ends every
// pass already issued.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const HALF_COOKIE = 'socria_dash_half';
export const PASS_COOKIE = 'socria_dash_pass';
/** Time to type the second code. */
export const HALF_TTL_MS = 10 * 60 * 1000;
/** How long a pass lasts before both codes are asked for again. */
export const PASS_TTL_MS = 12 * 60 * 60 * 1000;

function code(name: string): string | null {
  const v = (process.env[name] ?? '').trim();
  // an empty or trivially short value is not a code: it would open the page to anyone
  return v.length >= 6 ? v.toUpperCase() : null;
}
const codes = (): [string, string] | null => {
  const a = code('SOCRIA_DASHBOARD_CODE_1');
  const b = code('SOCRIA_DASHBOARD_CODE_2');
  return a && b ? [a, b] : null;
};

/** Whether the code way in exists on this deployment. */
export function dashboardCodesConfigured(): boolean {
  return codes() !== null;
}

const digest = (s: string) => createHash('sha256').update(s, 'utf8').digest();

/** Is `typed` the code for `step`? Trimmed, any case, compared in constant time. */
export function codeMatches(step: 1 | 2, typed: unknown): boolean {
  const c = codes();
  if (!c || typeof typed !== 'string') return false;
  const t = typed.trim().toUpperCase();
  if (!t || t.length > 200) return false;
  return timingSafeEqual(digest(t), digest(c[step - 1]));
}

function key(): Buffer | null {
  const c = codes();
  if (!c) return null;
  return digest(`socria.dashboard.v1|${c[0]}|${c[1]}|${process.env.CLERK_SECRET_KEY ?? ''}`);
}

type Kind = 'half' | 'pass';

/** A signed cookie value: what it is, when it ends, and the signature. */
export function issue(kind: Kind, now: number): string | null {
  const k = key();
  if (!k) return null;
  const body = `${kind}.${now + (kind === 'half' ? HALF_TTL_MS : PASS_TTL_MS)}`;
  return `${body}.${createHmac('sha256', k).update(body, 'utf8').digest('base64url')}`;
}

/** Does this cookie value prove `kind`, now? Anything malformed, forged or late is no. */
export function holds(kind: Kind, value: unknown, now: number): boolean {
  const k = key();
  if (!k || typeof value !== 'string' || value.length > 200) return false;
  const parts = value.split('.');
  if (parts.length !== 3 || parts[0] !== kind) return false;
  const until = Number(parts[1]);
  if (!Number.isFinite(until) || until <= now) return false;
  const want = createHmac('sha256', k).update(`${parts[0]}.${parts[1]}`, 'utf8').digest();
  let got: Buffer;
  try {
    got = Buffer.from(parts[2], 'base64url');
  } catch {
    return false;
  }
  return got.length === want.length && timingSafeEqual(got, want);
}
