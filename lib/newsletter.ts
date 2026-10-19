// lib/newsletter.ts
//
// The Socria newsletter: who asked for it, what an issue says, and the rules
// for sending one.
//
// HOW IT DIFFERS FROM THE NOTES. lib/lifecycle.ts sends a handful of notes
// about a person's own thinking here, on a schedule of its own. The
// newsletter is the other kind of email: an issue about Socria — what is new,
// what changed — written by a person, reviewed and committed, and sent to
// everyone who asked for it.
//
// WHEN AN ISSUE GOES. Approved issues (not `draft`) go out in the order they
// are listed, one every NEWSLETTER_EVERY_DAYS days (two by default), from a
// daily cron (app/api/cron/newsletter, the rule is planNewsletter below). The
// schedule only ever picks from issues a person wrote and approved; with
// none waiting, nothing goes. One can still be sent by hand
// (app/api/email/newsletter).
//
// WHO IS SUBSCRIBED is one row: the ledger (lib/lifecycle-store.ts) holds
// `newsletter` for a person, or it does not. Three things write or remove it:
// the box on the sign-up form (ticked to begin with only where the law
// allows that — lib/newsletter-consent.ts; unticked writes nothing), the
// switch under Data & Privacy, and the unsubscribe link in every issue. The general "stop these emails" link removes it too — a
// person who presses unsubscribe on any Socria email wants Socria email to
// stop, and only the newsletter's own link is narrower than that.
//
// THE RULES THE NOTES KEEP, KEPT HERE TOO:
//   - never to a university address added for student access — the same
//     lifecycleAddress the notes use, so the two cannot disagree;
//   - never twice: each issue is claimed per person in the ledger before it
//     goes (`newsletter:<issue>`), insert first and send only on success;
//   - nothing a person wrote, ever — an issue is about Socria, not them;
//   - every issue says why it arrived and carries a one-click unsubscribe.
//
// AND ONE THE NOTES DO NOT NEED. An issue is a commercial message, and US
// law (CAN-SPAM) requires a commercial email to carry the sender's postal
// address. The copy below will not render without one, so an issue with no
// address cannot be sent — the same way a note without a signing secret
// cannot (lib/email.ts).
//
// Pure, like lib/lifecycle.ts: no network, no database, no React.

import { escapeHtml, type EmailCopy } from './lifecycle';

/** The ledger kind that says "this person asked for the newsletter". */
export const NEWSLETTER_KIND = 'newsletter';

/** The `l` an unsubscribe link carries when it stops the newsletter only. */
export const NEWSLETTER_LIST = 'newsletter';

/**
 * An issue id: lowercase letters, digits and inner hyphens, up to forty
 * characters — so it can sit in a ledger kind and a URL exactly as written.
 */
const ISSUE_ID = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

export function isIssueId(v: unknown): v is string {
  return typeof v === 'string' && ISSUE_ID.test(v);
}

/** The ledger kind that makes one issue once-ever per person. */
export type IssueKind = `newsletter:${string}`;

export function issueKind(id: string): IssueKind {
  return `newsletter:${id}`;
}

export interface NewsletterIssue {
  /**
   * Permanent once the issue has gone out to anyone: it is the key that
   * makes the issue once-ever, so a changed id is a new issue and would go
   * to everyone again.
   */
  id: string;
  subject: string;
  /** the line most mail clients show beside the subject */
  preheader?: string;
  /** the issue, paragraph by paragraph, as plain text */
  paragraphs: string[];
  /** at most one link, and only to a page on the site */
  link?: { label: string; path: string };
  /** a draft can be rehearsed and previewed, never sent */
  draft?: boolean;
}

const SUBJECT_MAX = 120;

/**
 * What is wrong with an issue, if anything — the send route refuses an issue
 * with problems, and the suite runs this over every committed issue so a bad
 * one fails the build rather than the send.
 *
 * Paragraphs are plain text and are escaped when rendered, so markup in one
 * would arrive as visible angle brackets; it is refused here instead. The
 * one link must be a path on the site: an issue that pointed somewhere else
 * would be asking people to trust a link in an email from us to a page we do
 * not control.
 */
export function issueProblems(issue: NewsletterIssue): string[] {
  const out: string[] = [];
  if (!isIssueId(issue.id)) out.push('id: lowercase letters, digits and hyphens, up to forty');
  const subject = (issue.subject ?? '').trim();
  if (!subject) out.push('subject: empty');
  else if (subject.length > SUBJECT_MAX) out.push(`subject: longer than ${SUBJECT_MAX} characters`);
  const paras = Array.isArray(issue.paragraphs) ? issue.paragraphs : [];
  if (!paras.length || paras.some((p) => typeof p !== 'string' || !p.trim())) out.push('paragraphs: none, or an empty one');
  if (paras.some((p) => typeof p === 'string' && /<\/?[a-z][^>]*>/i.test(p))) out.push('paragraphs: plain text only — no markup');
  if (issue.link) {
    const { label, path } = issue.link;
    if (!label?.trim()) out.push('link: no label');
    if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || /\s/.test(path)) {
      out.push('link: a path on the site, beginning with one "/"');
    }
  }
  return out;
}

export function findIssue(issues: readonly NewsletterIssue[], id: unknown): NewsletterIssue | null {
  if (!isIssueId(id)) return null;
  return issues.find((i) => i.id === id) ?? null;
}

// ── unsubscribing ───────────────────────────────────────────────────
//
// The newsletter's link is the notes' link with one more parameter. The
// token is the same HMAC over the same id (lib/lifecycle.ts) — it proves the
// link was made for this person — and `l=newsletter` only NARROWS what the
// press does. Taking it off widens the press to every Socria email, for the
// same person the token was made for, which is nothing a stranger can use.

/** The newsletter's unsubscribe address, with its token. */
export function newsletterUnsubscribeUrl(base: string, userId: string, token: string): string {
  const q = new URLSearchParams({ u: userId, t: token, l: NEWSLETTER_LIST });
  return `${base.replace(/\/$/, '')}/api/email/unsubscribe?${q.toString()}`;
}

/** What an unsubscribe press stops: the newsletter alone, or every email. */
export function unsubscribeScope(l: unknown): 'newsletter' | 'all' {
  return l === NEWSLETTER_LIST ? 'newsletter' : 'all';
}

// ── the decision ────────────────────────────────────────────────────

export type NewsletterSkip = 'draft' | 'not-subscribed' | 'already-sent' | 'no-address';

export type NewsletterDecision = { send: true; to: string } | { send: false; reason: NewsletterSkip };

/**
 * Whether one issue may go to one person. A draft never goes; then the
 * subscription, then once-ever, then an address that is not a university
 * one (the caller passes lifecycleAddress's answer, null for "none").
 */
export function decideNewsletter(input: {
  issue: NewsletterIssue;
  subscribed: boolean;
  alreadySent: boolean;
  address: string | null;
}): NewsletterDecision {
  if (input.issue.draft) return { send: false, reason: 'draft' };
  if (!input.subscribed) return { send: false, reason: 'not-subscribed' };
  if (input.alreadySent) return { send: false, reason: 'already-sent' };
  if (!input.address) return { send: false, reason: 'no-address' };
  return { send: true, to: input.address };
}

// ── the copy ────────────────────────────────────────────────────────

export interface NewsletterContext {
  /** where the site is (lib/email.ts emailBaseUrl) */
  base: string;
  /** this person's newsletter unsubscribe address */
  unsubscribeUrl: string;
  /** the sender's postal address — required (see the header) */
  postalAddress: string;
}

const SIGN_OFF = '— Socria';
const WHY = 'You are getting this because you are subscribed to the Socria newsletter.';

/**
 * Both renderings of one issue, or null when it cannot be sent as written —
 * no postal address, or an issue with problems. Null rather than a throw
 * because the caller is a send loop, and one refusal should stop the run
 * cleanly before anyone is mailed, not halfway through.
 */
export function newsletterCopy(issue: NewsletterIssue, ctx: NewsletterContext): EmailCopy | null {
  const postal = (ctx.postalAddress ?? '').trim();
  if (!postal || issueProblems(issue).length) return null;

  const base = ctx.base.replace(/\/$/, '');
  const link = issue.link ? { label: issue.link.label.trim(), href: `${base}${issue.link.path}` } : null;
  const subject = issue.subject.trim();
  const paras = issue.paragraphs.map((p) => p.trim());

  const text = [
    ...paras,
    ...(link ? [`${link.label}: ${link.href}`] : []),
    SIGN_OFF,
    '',
    `${WHY} Unsubscribe: ${ctx.unsubscribeUrl}`,
    postal,
  ].join('\n\n');

  const style =
    'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;' +
    'color:#1d1d1f;max-width:34em;margin:2em auto;padding:0 1em;line-height:1.55;font-size:16px';
  const small = 'color:#6e6e73;font-size:14px';
  // The preheader is the first text in the body, hidden: mail clients show it
  // beside the subject, and without one they show whatever comes first.
  const pre = issue.preheader?.trim()
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(issue.preheader.trim())}</div>`
    : '';
  const html =
    `<!doctype html><html><body style="${style}">` +
    pre +
    paras.map((p) => `<p>${escapeHtml(p)}</p>`).join('') +
    (link ? `<p><a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a></p>` : '') +
    `<p>${escapeHtml(SIGN_OFF)}</p>` +
    `<p style="${small}">${escapeHtml(WHY)} ` +
    `<a href="${escapeHtml(ctx.unsubscribeUrl)}" style="color:#6e6e73">Unsubscribe</a>.</p>` +
    `<p style="${small}">${escapeHtml(postal)}</p>` +
    '</body></html>';

  return { subject, text, html };
}

// ── the schedule ────────────────────────────────────────────────────
//
// One issue every few days, from the approved ones, in the order they are
// written in lib/newsletter-issues.ts. The cron runs daily; each run either
// keeps delivering the issue that is going out now (a batch is bounded, and
// someone who subscribed yesterday still gets this one), or — once its days
// are up — starts the next approved issue nobody has had yet, or does
// nothing. Never two issues in one window, never an issue twice to anyone
// (the per-person ledger claim), and never anything that was not approved.

export const DEFAULT_EVERY_DAYS = 2;
const DAY = 86_400_000;
/** A daily cron lands a little early or late; three hours of slack keeps "every other day" on its day. */
const SLACK = 3 * 3_600_000;

/** NEWSLETTER_EVERY_DAYS, as a whole number of days from 1 to 30; anything else is the default. */
export function everyDays(raw: string | undefined): number {
  const n = Number((raw ?? '').trim());
  return Number.isInteger(n) && n >= 1 && n <= 30 ? n : DEFAULT_EVERY_DAYS;
}

/** An issue that may go: approved, and with nothing wrong with it. */
export const isReady = (i: NewsletterIssue) => !i.draft && issueProblems(i).length === 0;

export type NewsletterStep =
  | { action: 'continue'; issue: NewsletterIssue; startedAt: number }
  | { action: 'start'; issue: NewsletterIssue }
  | { action: 'wait'; current: NewsletterIssue; nextAt: number }
  | { action: 'nothing'; reason: 'no-ready-issue' | 'all-sent' };

/**
 * What today's run does. `startedAt` holds, by issue id, when each issue that
 * has begun going out began (the ledger's first claim); an issue absent from
 * it has gone to nobody.
 */
export function planNewsletter(input: {
  issues: readonly NewsletterIssue[];
  startedAt: ReadonlyMap<string, number>;
  now: number;
  everyDays: number;
}): NewsletterStep {
  const { issues, startedAt, now } = input;
  const window = Math.max(1, input.everyDays) * DAY;
  let current: { issue: NewsletterIssue; at: number } | null = null;
  for (const i of issues) {
    const at = startedAt.get(i.id);
    if (at !== undefined && (!current || at > current.at)) current = { issue: i, at };
  }
  // the issue going out now keeps going out until its days are up
  if (current && now - current.at < window - SLACK) {
    return isReady(current.issue)
      ? { action: 'continue', issue: current.issue, startedAt: current.at }
      : { action: 'wait', current: current.issue, nextAt: current.at + window - SLACK };
  }
  const next = issues.find((i) => isReady(i) && !startedAt.has(i.id));
  if (next) return { action: 'start', issue: next };
  return { action: 'nothing', reason: issues.some(isReady) ? 'all-sent' : 'no-ready-issue' };
}
