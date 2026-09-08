// lib/email.ts
//
// Sending an email, through Resend's HTTP API, over plain fetch.
//
// No SDK, for the same reason lib/rate-limit.ts talks to Upstash without
// one: the API is one POST, and a dependency that exists to wrap one POST is
// a dependency whose upgrades will one day break a build over nothing.
//
// Three switches, and the order they are checked in matters:
//
//   LIFECYCLE_EMAILS=on   the kill switch. UNSET IS OFF. A deployment that
//                         has not decided to send email sends none, whatever
//                         keys it happens to hold — a preview with a copied
//                         production environment must not mail real people.
//   EMAIL_SECRET          REQUIRED for any send. It signs the unsubscribe
//                         link; an email that cannot carry a working
//                         unsubscribe link is one that must not go out.
//   RESEND_API_KEY        the provider itself.
//
// sendEmail never throws. Every caller is on a path — a webhook, a 402, a
// cron — where an email is the least important thing happening, and where an
// exception would turn a missed note into a missed payment or a 500.
//
// Nothing here logs an address, a subject or a body. The logs say which
// kind of failure happened and the provider's status code; that is enough
// to fix it and nothing more.

const RESEND_URL = 'https://api.resend.com/emails';

/** How long the provider gets before a send is treated as failed. */
export const SEND_TIMEOUT_MS = 8000;

/**
 * How long a request that is really about something else — a webhook, a
 * refusal — may wait on email before carrying on without it.
 */
export const RACE_MS = 1500;

export const DEFAULT_FROM = 'Socria <hello@socria.app>';

/** The kill switch. Unset is off. */
export function lifecycleEmailsOn(): boolean {
  return (process.env.LIFECYCLE_EMAILS || '').trim().toLowerCase() === 'on';
}

export function emailFrom(): string {
  return (process.env.EMAIL_FROM || '').trim() || DEFAULT_FROM;
}

/**
 * Where links in an email point. Never the request origin: the sender is a
 * cron or a webhook, whose origin is nobody's browser. Falls back to the
 * canonical site rather than localhost so a misconfigured deployment sends
 * a link that at least goes somewhere real.
 */
export function emailBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://socria.app').replace(/\/$/, '');
}

let warnedSecret = false;
let warnedKey = false;

/** The signing secret for unsubscribe links, or null — logged once. */
export function emailSecret(): string | null {
  const s = (process.env.EMAIL_SECRET || '').trim();
  if (s) return s;
  if (!warnedSecret) {
    warnedSecret = true;
    console.warn('email: EMAIL_SECRET not set — no email will be sent');
  }
  return null;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** the one-click unsubscribe address; sets the List-Unsubscribe headers */
  unsubscribeUrl?: string;
  headers?: Record<string, string>;
}

export type SendResult =
  | { ok: true; id: string | null }
  | {
      ok: false;
      reason: 'off' | 'unconfigured' | 'bad-address' | 'provider' | 'network';
      status?: number;
    };

const ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Send one email. Never throws; the result says what happened.
 *
 * List-Unsubscribe and its one-click companion are added whenever the
 * message carries an unsubscribe address, because mail clients surface that
 * header as a button beside the sender's name — the place a person looks
 * first when they want a note to stop.
 */
export async function sendEmail(msg: EmailMessage): Promise<SendResult> {
  if (!lifecycleEmailsOn()) return { ok: false, reason: 'off' };
  if (!emailSecret()) return { ok: false, reason: 'unconfigured' };

  const key = (process.env.RESEND_API_KEY || '').trim();
  if (!key) {
    if (!warnedKey) {
      warnedKey = true;
      console.warn('email: RESEND_API_KEY not set — no email will be sent');
    }
    return { ok: false, reason: 'unconfigured' };
  }

  const to = (msg.to || '').trim();
  if (!ADDRESS.test(to)) return { ok: false, reason: 'bad-address' };

  const headers: Record<string, string> = { ...(msg.headers ?? {}) };
  if (msg.unsubscribeUrl) {
    headers['List-Unsubscribe'] = `<${msg.unsubscribeUrl}>`;
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: emailFrom(),
        to: [to],
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
        headers,
      }),
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) {
      console.warn('email: provider refused', res.status);
      return { ok: false, reason: 'provider', status: res.status };
    }
    const json = (await res.json().catch(() => null)) as { id?: unknown } | null;
    return { ok: true, id: typeof json?.id === 'string' ? json.id : null };
  } catch {
    // Timed out, or the network is down. The caller releases its claim and
    // the note is either retried tomorrow or not sent; neither is an outage.
    console.warn('email: provider unreachable');
    return { ok: false, reason: 'network' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Wait this long and no longer.
 *
 * For the callers whose request is about something else: a webhook that
 * must answer Stripe, a chat route that must answer the person. The work
 * carries on in the background if it is slow; the caller gets `fallback`
 * and moves on. Never rejects — a rejection here would be the exact failure
 * this exists to prevent.
 */
export function withTimeout<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    work.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      }
    );
  });
}
