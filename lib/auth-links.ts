// lib/auth-links.ts
//
// The two doors, and carrying where somebody was going through either of them.
//
// Nothing in the app linked to /sign-up. Every entry point — the landing
// header, the chat, the 404, the account pages, the One page — sent people to
// /sign-in, and the only route to creating an account was the small footer
// link inside Clerk's own card. Somebody trying to join wrote in to ask how,
// because the product had quietly decided everyone arriving was a returning
// user. That is the bug this file exists to make hard to reintroduce.
//
// WHY THE REDIRECT IS VALIDATED RATHER THAN PASSED ALONG.
//
// `redirect_url` arrives in the query string and is put straight into a link
// on the page, and an auth screen is the single most valuable place on any
// site to plant a redirect: somebody who followed a link that says "sign in to
// Socria", signed in, and was then bounced to a page that is not Socria has
// been phished with our own domain doing the convincing. Clerk applies its own
// allowlist to the ones IT consumes, but this file hands the value to a plain
// <a>, so it does its own checking and does not rely on someone else's.
//
// The rule is deliberately strict: a path on this site, and nothing else. Not
// a hostname we happen to like, not a scheme we recognise — a path. Anything
// else is dropped and the person lands on the default, which is a small
// inconvenience where the alternative is a credential theft we helped with.

export type AuthKind = 'sign-in' | 'sign-up';

/**
 * Is this somewhere on this site?
 *
 * A single leading slash, and no second one: "//evil.com" is a
 * protocol-relative URL that every browser reads as a different host, and it
 * is the oldest way past a naive "must start with /" check. Backslashes are
 * refused for the same reason — some parsers treat "/\evil.com" as
 * protocol-relative — and a control character can smuggle a newline into a
 * header further down the line.
 */
export function isSafeRedirect(to: unknown): to is string {
  if (typeof to !== 'string') return false;
  const v = to.trim();
  if (v.length === 0 || v.length > 512) return false;
  if (!v.startsWith('/')) return false;
  if (v.startsWith('//') || v.startsWith('/\\')) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(v)) return false;
  return true;
}

/**
 * A link to one of the two doors, keeping where they were headed.
 *
 * Clerk reads `redirect_url` on both pages, so the same parameter works
 * whichever door somebody chooses — which is the point: a person who came to
 * sign in, discovered they have no account, and crossed to sign up should
 * still end up where they were going.
 */
export function authUrl(kind: AuthKind, redirectTo?: unknown): string {
  const base = `/${kind}`;
  if (!isSafeRedirect(redirectTo)) return base;
  return `${base}?redirect_url=${encodeURIComponent(redirectTo)}`;
}

/** The other door, for the cross-link on each auth screen. */
export function otherAuth(kind: AuthKind): AuthKind {
  return kind === 'sign-in' ? 'sign-up' : 'sign-in';
}

/**
 * What the cross-link should say.
 *
 * Phrased from where they are: somebody on the sign-in page who cannot get in
 * needs to be told an account is something they can make, in words that do not
 * assume they already tried and failed.
 */
export const AUTH_CROSSLINK: Record<AuthKind, { lead: string; action: string }> = {
  'sign-in': { lead: 'New to Socria?', action: 'Create an account' },
  'sign-up': { lead: 'Already have an account?', action: 'Sign in' },
};
