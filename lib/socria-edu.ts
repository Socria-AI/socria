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
  return emailMatchesHosts(email, eduDomains());
}

/**
 * The same rule, against a list handed in rather than read from the
 * environment.
 *
 * The browser cannot read SOCRIA_EDU_DOMAINS — the form that checks an
 * address before sending a code is a client component, and it receives the
 * domains from /api/logos/plan. Without this it would need its own copy of the
 * matching rule, and the copy would be the one that eventually disagrees:
 * accepting a suffix, or a domain in the local part, in exactly the way the
 * comment above says not to. So the rule lives here once and both callers use
 * it. The client's answer is a courtesy either way — the server checks again,
 * and the address still has to be verified before it counts.
 */
export function emailMatchesHosts(email: unknown, hosts: readonly string[]): boolean {
  if (typeof email !== 'string' || !hosts.length) return false;
  const at = email.lastIndexOf('@');
  if (at < 1) return false;
  const domain = email.slice(at + 1).trim().toLowerCase();
  if (!domain) return false;
  return hosts.includes(domain);
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
 * The institutions we can name, by domain.
 *
 * "A university address" is what the copy said before this, and it was
 * needlessly vague to the only people who can use it: a UT Arlington student
 * reading "verify an address at @mavs.uta.edu" has to work out that this
 * means them. Naming the place is the whole improvement.
 *
 * A table rather than another environment variable. The domains are already
 * configured; what a domain is CALLED is not deployment configuration, it is
 * a fact about the domain, and it belongs next to it. Adding a school is one
 * line here, and a domain that is not in the table still works — it just gets
 * the general wording back, which is why this can never be the thing that
 * breaks the programme.
 *
 * `short` is the form that reads well inline ("your UTA email"); `name` is the
 * form that reads well as a subject ("UT Arlington students").
 */
const SCHOOLS: Record<string, { name: string; short: string }> = {
  'mavs.uta.edu': { name: 'UT Arlington', short: 'UTA' },
  'uta.edu': { name: 'UT Arlington', short: 'UTA' },
};

/** How to name the institution, when every configured domain is the same one. */
export interface EduSchool {
  /** as a subject, e.g. "UT Arlington" */
  name: string;
  /** inline, e.g. "UTA" */
  short: string;
}

/**
 * The school this deployment's programme is for, if it is for exactly one.
 *
 * Deliberately silent when the domains span more than one institution, or
 * include one that is not in the table. Copy that names a school is only
 * better than copy that does not while it is TRUE, and "UT Arlington
 * students" on a deployment that also admits another school is worse than
 * saying nothing — it tells the other school's students they do not qualify.
 */
export function eduSchool(): EduSchool | null {
  const known = eduDomains().map((d) => SCHOOLS[d]);
  if (!known.length || known.some((k) => !k)) return null;
  const first = known[0];
  return known.every((k) => k.name === first.name) ? first : null;
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
