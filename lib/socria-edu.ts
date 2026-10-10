// lib/socria-edu.ts
//
// Socria One for students, by verified university email.
//
// The rule is one sentence: an account that verifies an email address at an
// approved university domain, while this semester's offer is open, has its
// first month of Socria One free. They keep their ordinary account and their
// ordinary sign-in; the university address is added alongside, the way
// anyone adds a second email. (It used to be free for as long as the address
// was held. The offer below is what replaced that — see STUDENT_OFFER.)
//
// TWO THINGS THIS GETS RIGHT, AND BOTH MATTER MORE THAN THE FEATURE.
//
// VERIFIED, NOT TYPED. Anyone can write "someone@mavs.uta.edu" into a form.
// What cannot be faked is receiving the code sent to it, and Clerk already
// does that for every address on an account. So the check is on
// `verification.status`, never on the string alone — an unverified address is
// a claim, and a claim is worth nothing here.
//
// CONFIGURED, OR SWITCHED ON BY AN OFFER. The approved domains come from the
// environment, so the programme exists where it has been switched on and
// nowhere else. The one exception is an offer — STUDENT_OFFER below — which
// is itself that decision, made for one school and one semester: while it is
// open, its domains qualify even where SOCRIA_EDU_DOMAINS is unset. Past its
// close, unset means off again, every function here answers no, and the code
// is inert rather than merely unused.

const DAY_MS = 86_400_000;

// ── this semester's offer ───────────────────────────────────────────
//
// THE FIRST MONTH, FREE. A student who verifies their university address gets
// Socria One for thirty days from the moment the server first sees it — not
// for as long as they hold the address. One month per account, begun once:
// removing the address and adding it back does not begin another, and the
// month is recorded on the account (lib/socria-one-grant.ts) so it is the
// same answer on every device.
//
// FOR THIS SEMESTER. A month can begin until the offer closes, at the end of
// 9 December 2026 on UT Arlington's clock; one begun before then runs its
// whole length.
// After that nothing new begins, and the student panel offers nothing.
//
// NO CARD, NOTHING RENEWS. The month is a grant, like a reward's — Stripe is
// never involved, so there is no subscription to start, convert or cancel, and
// no billing date anywhere is touched. When it ends the account is on the free
// plan, unless they have chosen to subscribe.
//
// Somebody already verified when this replaced "free for as long as it is
// held" begins their month the first time the server sees them after it —
// thirty days from then, not from a verification nobody recorded the date of.
export const STUDENT_OFFER = {
  /** where the offer applies when SOCRIA_EDU_DOMAINS does not say otherwise */
  domains: ['mavs.uta.edu'] as readonly string[],
  /** how long the free month runs, from when a verified address is first seen */
  days: 30,
  /** the last moment a month can begin: midnight at the end of 9 December 2026, Central time */
  closes: Date.UTC(2026, 11, 10, 6, 0, 0),
} as const;

/** Whether a free month can still begin. */
export function studentOfferOpen(now = Date.now()): boolean {
  return now < STUDENT_OFFER.closes;
}

/**
 * The university domains that qualify: the environment's, or — where it says
 * nothing — the offer's while the offer is open.
 *
 * Comma-separated, case-insensitive, and a leading "@" or "." is tolerated
 * because that is how people write a domain when they are typing it into a
 * settings box at speed.
 */
export function eduDomains(now = Date.now()): string[] {
  const configured = (process.env.SOCRIA_EDU_DOMAINS || '')
    .split(',')
    .map((d) => d.trim().toLowerCase().replace(/^[@.]+/, ''))
    .filter(Boolean);
  if (configured.length) return configured;
  return studentOfferOpen(now) ? [...STUDENT_OFFER.domains] : [];
}

/** Whether the programme is switched on at all here. */
export function eduProgrammeOn(now = Date.now()): boolean {
  return eduDomains(now).length > 0;
}

/**
 * Say once, on the server, when the programme is off.
 *
 * WHY THIS EXISTS. With SOCRIA_EDU_DOMAINS unset, eduDomains() is empty,
 * eduProgrammeOn() is false, the plan route omits `student`, and
 * StudentAccess returns null — so the whole university-verification feature
 * disappears from the account page with no error, no warning and no trace.
 * Which is correct behaviour for a deployment that does not run the
 * programme, and indistinguishable from the feature being broken or deleted
 * for one that does. That ambiguity has already cost an afternoon.
 *
 * So the off state says so, once per process, naming the variable and what
 * it wants. Once rather than per request, because this is called on a route
 * a signed-in page polls, and a line per poll is a log nobody reads.
 */
let saidOff = false;
export function warnIfEduOff(): void {
  if (saidOff || eduProgrammeOn()) return;
  saidOff = true;
  console.warn(
    '[socria] university verification is OFF: SOCRIA_EDU_DOMAINS is unset and ' +
      'no student offer is open, so the student panel renders nothing. Set it ' +
      'to the comma-separated domains that qualify (e.g. ' +
      'SOCRIA_EDU_DOMAINS=mavs.uta.edu) to turn the programme on.'
  );
}

/**
 * Does this address belong to an approved university?
 *
 * Matched on the domain after the LAST "@", and only as a whole label, so
 * "mavs.uta.edu.example.com" is not a match and neither is
 * "notmavs.uta.edu" — a suffix test would accept both, and both are
 * registrable by anyone.
 */
export function isEduEmail(email: unknown, now = Date.now()): boolean {
  return emailMatchesHosts(email, eduDomains(now));
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
export function verifiedEduEmail(emails: readonly EmailLike[] | null | undefined, now = Date.now()): string | null {
  if (!eduProgrammeOn(now) || !Array.isArray(emails)) return null;
  for (const e of emails) {
    const address = typeof e?.emailAddress === 'string' ? e.emailAddress.trim().toLowerCase() : '';
    if (!address || !isEduEmail(address, now)) continue;
    // The whole point. An address that has not been verified is a string
    // somebody typed, and typing is not evidence of anything.
    if (e?.verification?.status !== 'verified') continue;
    return address;
  }
  return null;
}

/** Whether this account holds a qualifying address — the door to the month, not the month itself. */
export function hasEduAccess(emails: readonly EmailLike[] | null | undefined, now = Date.now()): boolean {
  return verifiedEduEmail(emails, now) !== null;
}

// ── the month ───────────────────────────────────────────────────────

/** A student's free month, as recorded on their account. */
export interface StudentMonth {
  /** the verified address it began with */
  email: string;
  /** when it began, ms */
  since: number;
  /** when it ends, ms — since + STUDENT_OFFER.days */
  until: number;
}

/** What is kept on the account: where the month began, and with which address. */
export interface StudentMonthRecord {
  email: string;
  since: number;
}

/**
 * A recorded month, read back tolerantly — anything that is not a sane record
 * reads as none, which can only ever cost somebody the month, never extend it.
 */
export function readStudentMonth(raw: unknown): StudentMonth | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const email = typeof r.email === 'string' ? r.email.trim().toLowerCase() : '';
  const since = typeof r.since === 'number' && Number.isFinite(r.since) && r.since > 0 ? r.since : null;
  if (!email || since === null) return null;
  return { email, since, until: since + STUDENT_OFFER.days * DAY_MS };
}

/** Where a student stands right now. */
export interface StudentStanding {
  /** the month they have — recorded, or beginning with this read — or none */
  month: StudentMonth | null;
  /** a month begins with this read and must be recorded */
  begins: boolean;
  /** Socria One, now, by being a student */
  active: boolean;
  /** the verified university address on the account, if any */
  email: string | null;
}

/**
 * Where a student stands: the month they have, or the one that begins now.
 *
 *   RECORDED — theirs to its end, while a verified university address is still
 *   on the account (the one it began with, or another at the same programme).
 *   Never a second: once begun, a month is the account's one month.
 *
 *   NONE RECORDED — one begins now, if the offer is open and a verified address
 *   qualifies. Otherwise there is nothing, and nothing to record.
 *
 * Pure: the caller reads the record and the addresses, and writes the record
 * back when `begins` says so.
 */
export function studentStanding(input: {
  emails: readonly EmailLike[] | null | undefined;
  recorded: StudentMonth | null;
  now: number;
}): StudentStanding {
  const { emails, recorded, now } = input;
  const qualifying = verifiedEduEmail(emails, now);
  if (recorded) {
    // the address it began with still counts after the offer has closed and
    // the programme's domains have gone quiet — a month begun is theirs to its end
    const holdsOriginal = Array.isArray(emails) && emails.some(
      (e) =>
        typeof e?.emailAddress === 'string' &&
        e.emailAddress.trim().toLowerCase() === recorded.email &&
        e?.verification?.status === 'verified'
    );
    const held = holdsOriginal || qualifying !== null;
    return {
      month: recorded,
      begins: false,
      active: held && now < recorded.until,
      email: holdsOriginal ? recorded.email : qualifying,
    };
  }
  if (qualifying && studentOfferOpen(now)) {
    return {
      month: { email: qualifying, since: now, until: now + STUDENT_OFFER.days * DAY_MS },
      begins: true,
      active: true,
      email: qualifying,
    };
  }
  return { month: null, begins: false, active: false, email: qualifying };
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
export function eduSchool(now = Date.now()): EduSchool | null {
  const known = eduDomains(now).map((d) => SCHOOLS[d]);
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
export function eduDomainLabel(now = Date.now()): string {
  const d = eduDomains(now);
  if (!d.length) return '';
  if (d.length === 1) return `@${d[0]}`;
  return d.slice(0, -1).map((x) => `@${x}`).join(', ') + ` or @${d[d.length - 1]}`;
}
