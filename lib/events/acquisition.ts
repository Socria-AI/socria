// lib/events/acquisition.ts — WHAT AN EVENT DID FOR SOCRIA, confirmed apart from estimated.
//
// CONFIRMED comes from records that identify the same person reliably:
//   • RSVPs and check-ins — the registrations themselves.
//   • Accounts — a registrant whose email matches a VERIFIED email on a Socria
//     account (Clerk). Unverified addresses never match: anyone can type one.
//     Only accounts created after the RSVP count as signed up from the event.
//     The match is made here, at read time, for aggregate numbers on the admin
//     page only — never stored, never shown per person — and the RSVP form's
//     privacy note says it happens.
//   • First meaningful use — such an account has saved at least one
//     conversation (Core or Logos).
//   • Seven-day return — such an account was active again seven or more days
//     after it was made, counted only over accounts at least seven days old.
//
// ESTIMATED comes from anonymous counters (product_events), which miss
// visitors who block scripts and count views rather than people:
//   • Page views of the event page, by link source.
//   • Sign-ups whose first touch carried this event's campaign tag
//     (utm_campaign=<event id>) — devices, not people, and only where the
//     visitor's country allows keeping a first-touch note.
//
// Server-only; read on each admin page load.

import 'server-only';
import { clerkClient } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import { currentEnv } from '@/lib/environment';
import type { RegistrationRow } from './model';

export interface Acquisition {
  estimated: {
    pageViews: number | null;
    viewsBySource: { source: string; n: number }[];
    rsvpPerView: number | null;
    signupsTagged: number | null;
  };
  confirmed: {
    matchedAccounts: number | null;
    signedUpAfterRsvp: number | null;
    attendeesSignedUp: number | null;
    firstUse: number | null;
    returnedAfter7d: number | null;
    eligibleFor7d: number | null;
  };
  notes: string[];
}

const DAY = 86_400_000;

async function counters(eventId: string): Promise<{ views: number; bySource: Map<string, number>; tagged: number } | null> {
  try {
    const db = supabaseAdmin();
    const env = currentEnv();
    const { data: v, error } = await db.from('product_events').select('kind, n').eq('env', env).eq('event', 'event_page_viewed');
    if (error) return null;
    const bySource = new Map<string, number>();
    let views = 0;
    for (const r of (v ?? []) as { kind: string; n: number }[]) {
      if (r.kind === `ev:${eventId}`) views += Number(r.n) || 0;
      else if (r.kind.startsWith(`ev:${eventId}|`)) {
        const s = r.kind.slice(`ev:${eventId}|`.length);
        bySource.set(s, (bySource.get(s) ?? 0) + (Number(r.n) || 0));
      }
    }
    const { data: s } = await db.from('product_events').select('kind, n').eq('env', env).eq('event', 'signup_completed').eq('kind', `camp:${eventId}`);
    const tagged = ((s ?? []) as { n: number }[]).reduce((a, r) => a + (Number(r.n) || 0), 0);
    return { views, bySource, tagged };
  } catch {
    return null;
  }
}

interface Account {
  id: string;
  createdAt: number;
  lastActiveAt: number | null;
  verified: string[];
}

async function accountsFor(emails: string[]): Promise<Account[] | null> {
  if (!process.env.CLERK_SECRET_KEY) return null;
  const out: Account[] = [];
  try {
    const users = clerkClient().users;
    for (let i = 0; i < emails.length; i += 100) {
      const res: any = await users.getUserList({ emailAddress: emails.slice(i, i + 100), limit: 100 });
      const list: any[] = Array.isArray(res) ? res : res?.data ?? [];
      for (const u of list) {
        const seen = [u?.lastActiveAt, u?.lastSignInAt].filter((t: unknown): t is number => typeof t === 'number');
        out.push({
          id: String(u.id),
          createdAt: Number(u.createdAt) || 0,
          lastActiveAt: seen.length ? Math.max(...seen) : null,
          verified: (u.emailAddresses ?? []).filter((e: any) => e?.verification?.status === 'verified').map((e: any) => String(e.emailAddress).toLowerCase()),
        });
      }
    }
    return out;
  } catch {
    return null;
  }
}

/** The pure part: given registrations, matched accounts and which accounts saved a conversation. */
export function confirmedFrom(regs: readonly RegistrationRow[], accounts: readonly Account[], used: ReadonlySet<string>, now: number): Acquisition['confirmed'] {
  const byEmail = new Map<string, Account>();
  for (const a of accounts) for (const e of a.verified) byEmail.set(e, a);
  const matched = new Map<string, { reg: RegistrationRow; acct: Account }>();
  for (const r of regs) {
    const a = r.email_norm ? byEmail.get(r.email_norm) : undefined;
    if (a && !matched.has(a.id)) matched.set(a.id, { reg: r, acct: a });
  }
  const after = [...matched.values()].filter((m) => m.acct.createdAt >= m.reg.registered_at);
  const eligible = after.filter((m) => now - m.acct.createdAt >= 7 * DAY);
  return {
    matchedAccounts: matched.size,
    signedUpAfterRsvp: after.length,
    attendeesSignedUp: after.filter((m) => m.reg.attendance === 'attended').length,
    firstUse: after.filter((m) => used.has(m.acct.id)).length,
    returnedAfter7d: eligible.filter((m) => (m.acct.lastActiveAt ?? 0) >= m.acct.createdAt + 7 * DAY).length,
    eligibleFor7d: eligible.length,
  };
}

export async function acquisitionFor(eventId: string, regs: readonly RegistrationRow[], now = Date.now()): Promise<Acquisition> {
  const notes: string[] = [];
  const c = await counters(eventId);
  if (!c) notes.push('Page views are unavailable: the product_events counter could not be read.');
  const online = regs.length;
  const emails = [...new Set(regs.map((r) => r.email_norm).filter((e): e is string => !!e))];
  const accounts = emails.length ? await accountsFor(emails) : [];
  let confirmed: Acquisition['confirmed'] = { matchedAccounts: null, signedUpAfterRsvp: null, attendeesSignedUp: null, firstUse: null, returnedAfter7d: null, eligibleFor7d: null };
  if (accounts === null) notes.push('Account matching is unavailable: Clerk is not configured or could not be reached.');
  else {
    const ids = accounts.map((a) => a.id);
    const used = new Set<string>();
    if (ids.length) {
      const { data } = await supabaseAdmin().from('conversations').select('user_id').in('user_id', ids);
      for (const r of (data ?? []) as { user_id: string }[]) used.add(r.user_id);
    }
    confirmed = confirmedFrom(regs, accounts, used, now);
  }
  return {
    estimated: {
      pageViews: c?.views ?? null,
      viewsBySource: c ? [...c.bySource].map(([source, n]) => ({ source, n })).sort((a, b) => b.n - a.n) : [],
      rsvpPerView: c && c.views > 0 ? online / c.views : null,
      signupsTagged: c?.tagged ?? null,
    },
    confirmed,
    notes,
  };
}
