// lib/socria-edu.ts
//
// Socria One for students, by verified university email.
//
// The rule is one sentence: an account holding a VERIFIED email address at an
// approved university domain has Socria One, free, for as long as it holds it.
// They keep their ordinary account and their ordinary sign-in; the university
// address is added alongside, the way anyone adds a second email.
//
// TWO THINGS THIS GETS RIGHT, AND BOTH MATTER MORE THAN THE FEATURE.
//
// VERIFIED, NOT TYPED. Anyone can write "someone@mavs.uta.edu" into a form.
// What cannot be faked is receiving the code sent to it, and Clerk already
// does that for every address on an account. So the check is on
// `verification.status`, never on the string alone — an unverified address is
// a claim, and a claim is worth nothing here.
//
// CONFIGURED, NOT COMPILED IN. The approved domains come from the
// environment, so the programme exists exactly where it has been switched on
// and nowhere else. With SOCRIA_EDU_DOMAINS unset — which is every deployment
// that has not opted in — every function here answers no, and the code is
// inert rather than merely unused. That is what makes it safe for this to sit
// in the same codebase as production while it is being tried on one branch.

/**
 * The university domains that qualify, from the environment.
 *
 * Comma-separated, case-insensitive, and a leading "@" or "." is tolerated
 * because that is how people write a domain when they are typing it into a
 * settings box at speed.
 */
export function eduDomains(): string[] {
  return (process.env.SOCRIA_EDU_DOMAINS || '')
    .split(',')
    .map((d) => d.trim().toLowerCase().replace(/^[@.]+/, ''))
    .filter(Boolean);
}

/** Whether the programme is switched on at all here. */
export function eduProgrammeOn(): boolean {
  return eduDomains().length > 0;
}

/**
 * Does this address belong to an approved university?
 *
 * Matched on the domain after the LAST "@", and only as a whole label, so
 * "mavs.uta.edu.example.com" is not a match and neither is
 * "notmavs.uta.edu" — a suffix test would accept both, and both are
 * registrable by anyone.
 */
export function isEduEmail(email: unknown): boolean {
  if (typeof email !== 'string') return false;
  const at = email.lastIndexOf('@');
  if (at < 1) return false;
  const domain = email.slice(at + 1).trim().toLowerCase();
  if (!domain) return false;
  return eduDomains().includes(domain);
}

/** The shape this needs from a Clerk user — kept narrow so it can be tested. */
export interface EmailLike {
  emailAddress?: string | null;
  verification?: { status?: string | null } | null;
}

/**
 * The verified university address on this account, if there is one.
 *
 * Returns the address rather than a boolean because the surfaces want to say
 * WHICH one qualified — "verified as ella@mavs.uta.edu" is a fact somebody can
 * check, and "you have student access" is one they have to take on trust.
 */
export function verifiedEduEmail(emails: readonly EmailLike[] | null | undefined): string | null {
  if (!eduProgrammeOn() || !Array.isArray(emails)) return null;
  for (const e of emails) {
    const address = typeof e?.emailAddress === 'string' ? e.emailAddress.trim().toLowerCase() : '';
    if (!address || !isEduEmail(address)) continue;
    // The whole point. An address that has not been verified is a string
    // somebody typed, and typing is not evidence of anything.
    if (e?.verification?.status !== 'verified') continue;
    return address;
  }
  return null;
}

/** Whether this account qualifies. */
export function hasEduAccess(emails: readonly EmailLike[] | null | undefined): boolean {
  return verifiedEduEmail(emails) !== null;
}

/**
 * How to describe the programme on screen, from the domains themselves.
 *
 * Derived rather than written down, so switching the domain switches the copy
 * and there is no second place saying the old one.
 */
export function eduDomainLabel(): string {
  const d = eduDomains();
  if (!d.length) return '';
  if (d.length === 1) return `@${d[0]}`;
  return d.slice(0, -1).map((x) => `@${x}`).join(', ') + ` or @${d[d.length - 1]}`;
}
