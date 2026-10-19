// lib/newsletter-send.ts — one issue of the newsletter, out to a batch of
// subscribers; or a rehearsal of that, which sends nothing.
//
// Shared by the two ways an issue goes: by hand (app/api/email/newsletter)
// and on the schedule (app/api/cron/newsletter). Both get the same rules,
// because they are the same code:
//   • the words come only from lib/newsletter-issues.ts, never a request;
//   • everything a real send needs is checked before anyone is claimed, and
//     whatever is missing is named — not discovered halfway down the list;
//   • each person's copy is claimed in the ledger before it goes, so calls
//     that overlap, or a call repeated after a timeout, never send anyone a
//     second copy;
//   • the answer is counts — never an address, never an id.

import 'server-only';
import { addressesFor } from '@/lib/email-recipients';
import { emailBaseUrl, emailSecret, newsletterEmailsOn, newsletterPostalAddress, sendEmail } from '@/lib/email';
import { unsubscribeToken } from '@/lib/lifecycle';
import { claimLifecycle, idsWithKind, markSent, releaseClaim } from '@/lib/lifecycle-store';
import { NEWSLETTER_KIND, decideNewsletter, issueKind, issueProblems, newsletterCopy, newsletterUnsubscribeUrl, type NewsletterIssue } from '@/lib/newsletter';

/** Clerk's page size, and the size of each look-up of addresses. */
const CHUNK = 100;
/** The provider's default pace is two requests a second; stay under it. */
const PACE_MS = 550;
/** Start nothing new after this long, so the call answers inside its limit. */
export const BUDGET_MS = 45_000;

type Counts = Record<string, number>;
const bump = (c: Counts, k: string) => void (c[k] = (c[k] ?? 0) + 1);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** What a real send of this issue still needs; empty when it can go. */
export function missingForSend(issue: NewsletterIssue): string[] {
  const missing: string[] = [];
  if (issue.draft) missing.push('the issue is marked draft');
  for (const p of issueProblems(issue)) missing.push(`the issue's ${p}`);
  if (!newsletterEmailsOn()) missing.push('NEWSLETTER_EMAILS=on');
  if (!emailSecret()) missing.push('EMAIL_SECRET');
  if (!(process.env.RESEND_API_KEY || '').trim()) missing.push('RESEND_API_KEY');
  if (!newsletterPostalAddress()) missing.push('NEWSLETTER_POSTAL_ADDRESS');
  return missing;
}

export type IssueRun =
  | { ok: false; status: number; error: string; missing?: string[] }
  | {
      ok: true;
      mode: 'send' | 'rehearsal';
      issue: string;
      subscribers: number;
      alreadyHave: number;
      pending: number;
      counts: Counts;
      done: boolean;
      capped?: true;
      missing: string[];
      preview?: { subject: string; text: string; html: string };
    };

export async function runIssue(issue: NewsletterIssue, opts: { send: boolean; only?: ReadonlySet<string> | null; limit: number; budgetMs?: number }): Promise<IssueRun> {
  const { send } = opts;
  const missing = missingForSend(issue);
  if (send && missing.length) return { ok: false, status: 409, error: 'Nothing was sent: a send needs all of these.', missing };
  const secret = emailSecret();
  const postal = newsletterPostalAddress();
  const budget = opts.budgetMs ?? BUDGET_MS;

  const kind = issueKind(issue.id);
  const [subs, claimed] = await Promise.all([idsWithKind(NEWSLETTER_KIND), idsWithKind(kind)]);
  if (!subs || !claimed) return { ok: false, status: 503, error: 'The ledger could not be read, so nobody was sent anything.' };

  const have = new Set(claimed.ids);
  const alreadyHave = subs.ids.filter((id) => have.has(id)).length;
  let pending = subs.ids.filter((id) => !have.has(id));
  if (opts.only) pending = pending.filter((id) => opts.only!.has(id));

  // A draft never sends — a send of one was refused above — so a rehearsal
  // decides as if it were ready, and counts what a send would do.
  const deciding = send ? issue : { ...issue, draft: false };
  const base = emailBaseUrl();
  const counts: Counts = {};
  const started = Date.now();
  let attempts = 0;
  let last = 0;
  let done = true;

  scan: for (let i = 0; i < pending.length; i += CHUNK) {
    if ((send && attempts >= opts.limit) || Date.now() - started > budget) {
      done = false;
      break;
    }
    const chunk = pending.slice(i, i + CHUNK);
    const addresses = await addressesFor(chunk);
    for (const userId of chunk) {
      if ((send && attempts >= opts.limit) || Date.now() - started > budget) {
        done = false;
        break scan;
      }
      const d = decideNewsletter({ issue: deciding, subscribed: true, alreadySent: false, address: addresses.get(userId) ?? null });
      if (!d.send) {
        bump(counts, d.reason);
        continue;
      }
      if (!send) {
        bump(counts, 'would-send');
        continue;
      }

      attempts++;
      const claim = await claimLifecycle(userId, kind);
      if (claim === 'already') {
        bump(counts, 'already-sent');
        continue;
      }
      if (claim === 'unavailable') {
        // The ledger stopped answering: nothing more can be promised once-ever.
        bump(counts, 'unavailable');
        done = false;
        break scan;
      }
      const unsub = newsletterUnsubscribeUrl(base, userId, unsubscribeToken(userId, secret!));
      const copy = newsletterCopy(issue, { base, unsubscribeUrl: unsub, postalAddress: postal! });
      if (!copy) {
        await releaseClaim(userId, kind);
        bump(counts, 'not-rendered');
        done = false;
        break scan;
      }
      const wait = PACE_MS - (Date.now() - last);
      if (last && wait > 0) await sleep(wait);
      last = Date.now();
      const result = await sendEmail({ to: d.to, subject: copy.subject, text: copy.text, html: copy.html, unsubscribeUrl: unsub, stream: 'newsletter' });
      if (!result.ok) {
        await releaseClaim(userId, kind);
        bump(counts, 'failed');
        continue;
      }
      await markSent(userId, kind, Date.now());
      bump(counts, 'sent');
    }
  }

  // A rehearsal shows the words, with a stand-in where each person's own
  // unsubscribe link and the postal address go.
  const preview = send
    ? undefined
    : newsletterCopy(deciding, {
        base,
        unsubscribeUrl: `${base}/api/email/unsubscribe?u=USER&t=TOKEN&l=newsletter`,
        postalAddress: postal ?? '[NEWSLETTER_POSTAL_ADDRESS is not set]',
      }) ?? undefined;

  return {
    ok: true,
    mode: send ? 'send' : 'rehearsal',
    issue: issue.id,
    subscribers: subs.ids.length,
    alreadyHave,
    pending: pending.length,
    counts,
    done,
    ...(subs.capped || claimed.capped ? { capped: true as const } : {}),
    missing,
    ...(preview ? { preview } : {}),
  };
}
