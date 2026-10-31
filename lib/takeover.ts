// lib/takeover.ts — THE RELAUNCH: WHILE IT RUNS, THE PUBLIC SITE IS ONE PAGE.
//
// "WE KILLED THE CHATBOT." on black, a chat dissolving into a network of
// thoughts, and beneath it one field for an access code
// (components/campaign/Campaign.tsx). Every public address shows that page or
// leads to it, and Logos 5 opens only for somebody who has entered the code.
//
// WHAT IS DECIDED HERE, from a request's path alone, for middleware.ts:
//   • home — `/`: the campaign page; with the code entered, straight to /chat.
//   • app  — Logos 5 and what opens into it (/chat, a share link, /memory …):
//            the page itself with the code; without it, the campaign page at
//            the same address, so entering the code opens the link followed.
//   • open — what has to keep working whatever the campaign says: signing in,
//            the account (billing, data export, deletion), the legal pages,
//            event RSVPs and their emailed tickets, referral links, link
//            preview cards, the team's dashboard and the platform's own paths.
//   • site — every other page — the landing, Socria One, the Charter, the
//            docs, the blog — sent to `/` while the campaign runs.
// And the API: all of it untouched except the routes that do Logos 5's
// thinking — a turn, the map, reading, writing, transcribing, a room — which
// answer 403 without the code, so the gate is not a page to be stepped round.
// Data, accounts, billing, webhooks, email and cron never ask for it.
//
// THE CODE IS NOT IN THIS REPOSITORY, which is public. What is here is its
// fingerprint, PBKDF2 over 300,000 rounds with a salt: whoever types the code
// matches it, and reading the code back off it is a long, expensive search
// rather than a lookup. SOCRIA_TAKEOVER_CODE replaces the code without a code
// change, from the next deployment.
//
// WHAT ENTERING IT GIVES: a cookie (httpOnly, 90 days) holding an expiry and
// an HMAC of it, keyed by a server secret mixed with which code is live — so
// it cannot be written by hand, and changing the code closes every entry made
// with the old one. Signed and checked with Web Crypto, the same code on the
// edge (middleware.ts) and in Node (app/api/access/enter), which hand it in.
//
// REVERSIBLE: SOCRIA_TAKEOVER=off (then redeploy) puts the site back exactly
// as it was — the landing, every page, Logos 5 open to everyone — and
// reverting the commit that brought this removes it outright. Nothing here
// touches data, accounts, billing or the backend.
//
// Server and edge only: a client component must never import this file (the
// fingerprint would ride along in the browser bundle). What the page itself
// needs is in lib/campaign.ts.

import { normalizeCode } from './feature-gates';

type Env = Record<string, string | undefined>;

/** The cookie an entry is carried in. */
export const ENTRY_COOKIE = 'socria_entry';
/** How long an entry lasts: the length of a relaunch. */
export const ENTRY_TTL_S = 90 * 24 * 60 * 60;

/**
 * The variables the campaign reads, each by name: dot access is what every
 * runtime fills in — the edge included, where the whole of process.env is not
 * promised.
 */
export function takeoverEnv(): Env {
  return {
    SOCRIA_TAKEOVER: process.env.SOCRIA_TAKEOVER,
    SOCRIA_TAKEOVER_CODE: process.env.SOCRIA_TAKEOVER_CODE,
    SOCRIA_TAKEOVER_SECRET: process.env.SOCRIA_TAKEOVER_SECRET,
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

/** Whether the campaign runs: on, unless SOCRIA_TAKEOVER says off. */
export function takeoverOn(env: Env = takeoverEnv()): boolean {
  const v = (env.SOCRIA_TAKEOVER ?? '').trim().toLowerCase();
  return !['off', '0', 'false', 'no'].includes(v);
}

// ── where a request goes ─────────────────────────────────────────────

export type PathClass = 'home' | 'app' | 'open' | 'site';

/** Logos 5, and what opens into it. */
const APP = ['/chat', '/logos', '/logos2', '/logos2-test', '/memory', '/model', '/mind-ar', '/onboarding', '/s', '/logos-5-internal'];

/** What keeps working whatever the campaign. */
const OPEN = [
  // signing in and up, and the OAuth return
  '/sign-in',
  '/sign-up',
  '/sso-callback',
  // the account: billing, data export, deletion, email switches
  '/account',
  // the legal pages, which sign-in, billing and the law all point to
  '/privacy',
  '/terms',
  '/security',
  '/subprocessors',
  // events: an RSVP, the ticket a guest was emailed, the door
  '/events',
  // a friend's referral link, which leads to sign-up
  '/r',
  // link-preview cards — the campaign's own among them
  '/og',
  // the team's dashboard and the CMS, each behind its own sign-in
  '/dev',
  '/studio',
  // the platform's own
  '/_vercel',
  '/__clerk',
  '/.well-known',
];

/**
 * The API routes that do Logos 5's thinking: a model call, a web fetch, a
 * transcription, a live room. Everything else in /api — data, the account,
 * billing, webhooks, email, cron, events — is never gated.
 */
const THINKING_API = [
  '/api/logos/chat',
  '/api/logos/map',
  '/api/logos/organize',
  '/api/logos/practice',
  '/api/logos/read',
  '/api/logos/easy',
  '/api/logos/write',
  '/api/logos/synthesize',
  '/api/logos/explore',
  '/api/logos/experience',
  '/api/logos/guest',
  '/api/logos/sources',
  '/api/logos/room',
  '/api/chat',
  '/api/mr',
  '/api/transcribe',
  '/api/extract-memory',
  '/api/update-understanding',
  '/api/generate-insight',
  '/api/generate-synthesis',
];

const under = (path: string, base: string) => path === base || path.startsWith(`${base}/`);
const isApi = (path: string) => under(path, '/api');

/** Which kind of page a path is, for the campaign. */
export function pathClass(path: string): PathClass {
  if (path === '/' || path === '') return 'home';
  if (APP.some((b) => under(path, b))) return 'app';
  if (OPEN.some((b) => under(path, b))) return 'open';
  return 'site';
}

/** Whether an API route is one of Logos 5's thinking routes. */
export function thinkingApi(path: string): boolean {
  return THINKING_API.some((b) => under(path, b));
}

/**
 * What the campaign does with a request: `next` lets it through as it is,
 * `show` is the campaign page at the address asked for, `go` a temporary
 * redirect, `refuse` a 403 from a thinking route.
 */
export type Decision = { do: 'next' } | { do: 'show' } | { do: 'go'; to: string } | { do: 'refuse' };

/** Whether the answer for this path depends on the entry — the cookie is only checked where it does. */
export function needsEntry(path: string): boolean {
  if (isApi(path)) return thinkingApi(path);
  const c = pathClass(path);
  return c === 'home' || c === 'app';
}

/** The campaign's answer for a path, given whether its sender has entered the code. */
export function decide(path: string, entered: boolean): Decision {
  if (isApi(path)) return thinkingApi(path) && !entered ? { do: 'refuse' } : { do: 'next' };
  switch (pathClass(path)) {
    case 'home':
      return entered ? { do: 'go', to: '/chat' } : { do: 'next' };
    case 'app':
      return entered ? { do: 'next' } : { do: 'show' };
    case 'open':
      return { do: 'next' };
    default:
      return { do: 'go', to: '/' };
  }
}

// ── the code ─────────────────────────────────────────────────────────

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('');
const fromHex = (h: string) => Uint8Array.from(h.match(/../g) ?? [], (x) => parseInt(x, 16));

const SALT = 'socria.takeover.v1';
const ROUNDS = 300_000;

/** The campaign code's fingerprint: PBKDF2-SHA256 of the code as compared (normalizeCode), SALT, ROUNDS. Never the code. */
const CODE_FINGERPRINT = 'dc06161359c79227b692025b9ee9ccc4be64d5ea26c159cf1d06a10a53f0ab63';

/** A code's fingerprint, as CODE_FINGERPRINT was made. */
export async function codeFingerprint(subtle: SubtleCrypto, code: string): Promise<string> {
  const key = await subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveBits']);
  return hex(await subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(SALT), iterations: ROUNDS, hash: 'SHA-256' }, key, 256));
}

const sha256 = async (subtle: SubtleCrypto, s: string) => hex(await subtle.digest('SHA-256', enc.encode(s)));

/** Equal, in time that does not depend on where two hex strings first differ. */
function sameHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** The code an operator set in the environment, as compared — or null, and the built-in one stands. */
function envCode(env: Env): string | null {
  const c = normalizeCode(env.SOCRIA_TAKEOVER_CODE ?? '');
  return c.length >= 6 ? c : null;
}

/**
 * Whether a typed code is the campaign's. Case and spaces never matter (it is
 * typed on phones). One PBKDF2 per try for the built-in code, which is what
 * the rate limit on app/api/access/enter is counting.
 */
export async function codeMatches(subtle: SubtleCrypto, typed: unknown, env: Env): Promise<boolean> {
  const t = normalizeCode(typed);
  if (!t || t.length > 64) return false;
  const set = envCode(env);
  if (set) return sameHex(await sha256(subtle, t), await sha256(subtle, set));
  return sameHex(await codeFingerprint(subtle, t), CODE_FINGERPRINT);
}

// ── the entry ────────────────────────────────────────────────────────

/** A secret the server holds and no visitor does; null, and nobody can enter (the gate stays shut). */
export function entrySecret(env: Env): string | null {
  for (const v of [env.SOCRIA_TAKEOVER_SECRET, env.CLERK_SECRET_KEY, env.SUPABASE_SERVICE_ROLE_KEY]) {
    const s = (v ?? '').trim();
    if (s.length >= 16) return s;
  }
  return null;
}

let keyCache: { id: string; key: CryptoKey } | null = null;

/** The key entries are signed with: the server's secret, mixed with which code is live. */
async function entryKey(subtle: SubtleCrypto, env: Env): Promise<CryptoKey | null> {
  const secret = entrySecret(env);
  if (!secret) return null;
  const set = envCode(env);
  const live = set ? await sha256(subtle, set) : CODE_FINGERPRINT;
  const id = await sha256(subtle, `${secret}|${live}`);
  if (keyCache?.id === id) return keyCache.key;
  const base = await subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const raw = await subtle.sign('HMAC', base, enc.encode(`${SALT}|entry|${live}`));
  const key = await subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  keyCache = { id, key };
  return key;
}

/** The cookie's value for an entry made now, or null when the server has no secret to sign it with. */
export async function issueEntry(subtle: SubtleCrypto, env: Env, now: number): Promise<string | null> {
  const key = await entryKey(subtle, env);
  if (!key) return null;
  const exp = String(Math.floor(now + ENTRY_TTL_S * 1000));
  return `v1.${exp}.${hex(await subtle.sign('HMAC', key, enc.encode(`v1.${exp}`)))}`;
}

const ENTRY = /^v1\.(\d{13})\.([0-9a-f]{64})$/;

/**
 * Whether a presented cookie is an entry this server made, for the code that
 * is live, and not yet expired. Every other case — malformed, forged, old,
 * made for a code since changed, no secret — is false.
 */
export async function entryValid(subtle: SubtleCrypto, env: Env, value: unknown, now: number): Promise<boolean> {
  if (typeof value !== 'string') return false;
  const m = ENTRY.exec(value);
  if (!m || !(Number(m[1]) > now)) return false;
  const key = await entryKey(subtle, env);
  if (!key) return false;
  return subtle.verify('HMAC', key, fromHex(m[2]), enc.encode(`v1.${m[1]}`));
}
