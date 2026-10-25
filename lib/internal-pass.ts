import 'server-only';
// lib/internal-pass.ts
//
// THE PASS TO /logos-5-internal: the new Socria's access code
// (lib/feature-gates-server.ts), typed once, earns a signed, httpOnly cookie
// that lets the architecture page render. The browser holds the signature,
// never the code.
//
// The key is derived from the code's fingerprint and a server secret
// (CLERK_SECRET_KEY), so a new code — NEW_SOCRIA_ACCESS_CODE — ends every
// pass already given. No server secret, no passes: the page asks for the code
// and no code opens it, rather than signing with a key anyone could rebuild
// from this public repository. What bounds guessing is the 'code' rate limit
// on the route (app/api/logos-5-internal/route.ts).

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { gateFingerprint } from './feature-gates-server';

export const INTERNAL_PASS_COOKIE = 'socria_l5i_pass';
/** How long a pass lasts before the code is asked for again. */
export const INTERNAL_PASS_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function key(): Buffer | null {
  const secret = (process.env.CLERK_SECRET_KEY ?? '').trim();
  const code = gateFingerprint('socria');
  if (!secret || !code) return null;
  return createHash('sha256').update(`socria.logos5-internal.v1|${code}|${secret}`, 'utf8').digest();
}

/** A signed pass, good from `now` for INTERNAL_PASS_TTL_MS; null when this deployment cannot sign one. */
export function issueInternalPass(now: number): string | null {
  const k = key();
  if (!k) return null;
  const body = `l5i.${now + INTERNAL_PASS_TTL_MS}`;
  return `${body}.${createHmac('sha256', k).update(body, 'utf8').digest('base64url')}`;
}

/** Does this cookie value let the page render, now? Anything malformed, forged or late is no. */
export function holdsInternalPass(value: unknown, now: number): boolean {
  const k = key();
  if (!k || typeof value !== 'string' || value.length > 200) return false;
  const parts = value.split('.');
  if (parts.length !== 3 || parts[0] !== 'l5i') return false;
  const until = Number(parts[1]);
  if (!Number.isFinite(until) || until <= now) return false;
  const want = createHmac('sha256', k).update(`${parts[0]}.${parts[1]}`, 'utf8').digest();
  const got = Buffer.from(parts[2], 'base64url');
  return got.length === want.length && timingSafeEqual(got, want);
}
