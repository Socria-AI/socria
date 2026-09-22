import 'server-only';
// lib/access-codes-server.ts
//
// The access codes, and the only place they exist.
//
// WHAT WENT WRONG BEFORE. Two codes were written as constants in
// lib/socria-prompt.ts and lib/socria-one.ts — modules that client components
// import. Next.js compiles an imported constant into the browser bundle, so
// both shipped to every visitor: one substituted for a Clerk session on 14 AI
// routes (`x-socria-key`), the other granted the paid plan on any request
// (`x-socria-one`). Neither was a secret; both were published.
//
// THE RULE THIS FILE ENFORCES. A code the server checks must never be a value
// the client holds. `import 'server-only'` makes that a build error rather
// than a convention: if any client component imports this module, the build
// fails. The codes now come from the environment and are compared here, on
// the server, against what the person typed.
//
// FAILS CLOSED. An unset variable disables that gate entirely — no code is
// accepted, and the route falls back to requiring a real Clerk session. So a
// deployment that says nothing about access codes has none, which is the
// behaviour you want by default and the opposite of what a hardcoded constant
// gives you.
//
// ROTATION IS AUTOMATIC. The cookie that carries a granted unlock is signed
// with a key derived from the codes themselves, so changing a code in the
// environment invalidates every grant already issued against the old one.
// There is no second secret to remember to rotate, and no window in which an
// old code keeps working through a cookie.

import { createHmac, timingSafeEqual, createHash } from 'node:crypto';

/** What an unlock is for. `one` implies `core`: the paid code opens both. */
export type AccessScope = 'core' | 'one';

/** The cookie a granted unlock is carried in. */
export const ACCESS_COOKIE = 'socria_access';

/** How long a grant lasts. Long enough to be useful, short enough to expire. */
export const GRANT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Values that were published in the browser bundle and are therefore dead.
 *
 * Stored as digests rather than literals so this file does not reintroduce
 * the strings it exists to refuse. An operator pasting an old code into the
 * new variable would otherwise quietly restore the original vulnerability
 * with a server-side check in front of it.
 */
const BURNED = new Set<string>([
  // the 22-character code that granted the paid plan
  '6472c4fc8c50189341fdc3448b9dab18bda5ef1f526d5ce0c98fad77fd5ff9a6',
  // the five-letter access key that stood in for a session
  '485a8bc030367212833d2211c1d8e7f8ff42c78276264aaf6c6f9fd9db516c41',
]);

function isBurned(v: string): boolean {
  const d = createHash('sha256').update(v, 'utf8').digest('hex');
  const u = createHash('sha256').update(v.toUpperCase(), 'utf8').digest('hex');
  return BURNED.has(d) || BURNED.has(u);
}

function envCode(name: string): string | null {
  const v = (process.env[name] || '').trim();
  // A short code is not a code. This also stops an empty-but-present variable
  // from turning the gate into "any input unlocks".
  if (v.length < 8) return null;
  if (isBurned(v)) {
    warnBurned(name);
    return null;
  }
  return v;
}

let warned = false;
function warnBurned(name: string): void {
  if (warned) return;
  warned = true;
  console.error(
    `${name} is set to a value that was published in a browser bundle. It is ignored. Choose a new code.`
  );
}

/** The code that unlocks auth-gated models without signing in. */
function coreCode(): string | null {
  return envCode('SOCRIA_ACCESS_CODE');
}

/** The code that grants Socria One. */
function oneCode(): string | null {
  return envCode('SOCRIA_ONE_CODE');
}

/** Whether either gate is configured at all. */
export function accessCodesConfigured(): boolean {
  return !!coreCode() || !!oneCode();
}

/**
 * Compare without leaking the answer through timing.
 *
 * Length differs → still hash both to a fixed width first, so the comparison
 * itself is always over equal-length buffers and an early length mismatch
 * does not short-circuit.
 */
function sameSecret(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a, 'utf8').digest();
  const hb = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(ha, hb);
}

/**
 * What the typed code opens, or null if it opens nothing.
 *
 * Case-insensitive, because these are read aloud and typed by hand; trimmed,
 * because they are pasted. Neither weakens anything: the keyspace is the
 * operator's choice and the guess rate is bounded by the rate limiter on the
 * one route that accepts a code.
 */
export function scopeForCode(raw: unknown): AccessScope | null {
  if (typeof raw !== 'string') return null;
  const typed = raw.trim();
  if (typed.length < 8 || typed.length > 200) return null;
  const one = oneCode();
  if (one && sameSecret(typed.toUpperCase(), one.toUpperCase())) return 'one';
  const core = coreCode();
  if (core && sameSecret(typed.toUpperCase(), core.toUpperCase())) return 'core';
  return null;
}

/**
 * The key the grant cookie is signed with.
 *
 * Derived from the codes, so rotating a code revokes every grant issued under
 * it. Returns null when nothing is configured, which makes both signing and
 * verifying impossible — the fail-closed path.
 */
function grantKey(): Buffer | null {
  const core = coreCode();
  const one = oneCode();
  if (!core && !one) return null;
  return createHash('sha256')
    .update(`socria.access.v1|${core ?? ''}|${one ?? ''}`, 'utf8')
    .digest();
}

function sign(payload: string, key: Buffer): string {
  return createHmac('sha256', key).update(payload, 'utf8').digest('base64url');
}

/** Mint the cookie value for a granted scope. */
export function issueGrant(scope: AccessScope, now: number): string | null {
  const key = grantKey();
  if (!key) return null;
  const payload = `${scope}.${now + GRANT_TTL_MS}`;
  return `${payload}.${sign(payload, key)}`;
}

/**
 * What a presented cookie actually grants.
 *
 * Every failure — malformed, unsigned, wrong signature, expired, unknown
 * scope, nothing configured — returns null. There is no branch that returns a
 * scope without a verified signature.
 */
export function readGrant(raw: unknown, now: number): AccessScope | null {
  if (typeof raw !== 'string' || raw.length > 400) return null;
  const key = grantKey();
  if (!key) return null;
  const parts = raw.split('.');
  if (parts.length !== 3) return null;
  const [scope, expRaw, mac] = parts;
  if (scope !== 'core' && scope !== 'one') return null;

  // A scope whose code is not configured is never honoured, however well the
  // cookie is signed.
  //
  // This is not belt-and-braces; it closes a real forgery. grantKey() mixes
  // BOTH codes, so with only one of them set the other half of the input is
  // the empty string — and a person holding the configured code then knows
  // the entire key input and can sign a grant for the scope they were never
  // given. A demo code would have minted the paid plan. Requiring the scope's
  // own code to exist removes the case where the key is derivable by someone
  // who should not hold it.
  if (scope === 'one' && !oneCode()) return null;
  if (scope === 'core' && !coreCode()) return null;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp <= now) return null;
  const expected = sign(`${scope}.${expRaw}`, key);
  // Both are base64url of a fixed-width digest, so the buffers match in
  // length whenever the input is well-formed; a wrong length is a forgery.
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;
  return scope;
}

/** Does this request carry a verified unlock of at least `need`? */
export function grantedScope(
  cookieValue: unknown,
  now: number = Date.now()
): AccessScope | null {
  return readGrant(cookieValue, now);
}

/** `one` satisfies `core`; `core` does not satisfy `one`. */
export function scopeSatisfies(held: AccessScope | null, need: AccessScope): boolean {
  if (!held) return false;
  return need === 'core' ? held === 'core' || held === 'one' : held === 'one';
}
