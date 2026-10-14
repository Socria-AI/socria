import 'server-only';
// lib/dashboard/collect.ts
//
// THE ONLY PART OF THE DASHBOARD THAT READS ANYTHING.
//
// Every read here is minimised at the source, because what is never read
// cannot leak from a page:
//
//   Clerk          sign-up and last-seen times, how an account signs in, the
//                  DOMAIN of its primary address (the address itself is
//                  dropped on the spot), whether a verified address is at a
//                  university, and the three Socria One flags the account's
//                  private metadata carries. Never a name, never an address.
//   conversations  owner, kind ('chat' | 'logos') and two timestamps. Never
//                  the messages, the title, the map or the memory.
//   user_profiles  the first-run milestones and the Conversation Style. Never
//                  the imported profile or the thinking journey.
//   the rest       statuses, kinds and timestamps from the subscription,
//                  newsletter and Rewards ledgers, and the anonymous counters.
//
// Each source is read on its own and fails on its own: a table that does not
// exist yet, a missing key, a Clerk outage — each becomes a line in the
// dashboard's "data sources" panel, never a broken page. Every read pages
// through its table and stops at a cap; a capped source says so.

import { clerkClient } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import { currentEnv } from '@/lib/environment';
import { parseFirstRun } from '@/lib/first-run';
import { readStudentMonth } from '@/lib/socria-edu';
import { GRANT_KEY, GRANT_VALUE, STUDENT_KEY, mirrorEntitles, readMirror } from '@/lib/socria-one-grant';
import { dayOf } from '@/lib/product-event-kinds';
import { isAcademicDomain } from './aggregate';
import type {
  AccountRow,
  Collected,
  ConversationRow,
  EventRow,
  GrantRow,
  MailRow,
  ProfileRow,
  PromoRow,
  ReferralRow,
  SourceHealth,
  SubscriptionRow,
} from './types';

const CLERK_PAGE = 500;
const CLERK_CAP = 20_000;
const DB_PAGE = 1000;
const DB_CAP = 200_000;

const domainOf = (address: unknown): string | null => {
  if (typeof address !== 'string') return null;
  const at = address.lastIndexOf('@');
  return at > 0 ? address.slice(at + 1).trim().toLowerCase() || null : null;
};

/** One Clerk user, reduced to an AccountRow. Exported for the tests. */
export function toAccount(u: any): AccountRow {
  const emails: any[] = Array.isArray(u?.emailAddresses) ? u.emailAddresses : [];
  const primary = emails.find((e) => e?.id === u?.primaryEmailAddressId) ?? emails[0];
  const meta = (u?.privateMetadata ?? null) as Record<string, unknown> | null;
  const methods = new Set<string>();
  for (const x of Array.isArray(u?.externalAccounts) ? u.externalAccounts : []) {
    const p = String(x?.provider ?? '').replace(/^oauth_/, '').toLowerCase();
    if (p) methods.add(p);
  }
  if (u?.passwordEnabled) methods.add('password');
  if (!methods.size) methods.add('email-code');
  const seen = [u?.lastActiveAt, u?.lastSignInAt].filter((t): t is number => typeof t === 'number');
  return {
    id: String(u?.id ?? ''),
    createdAt: typeof u?.createdAt === 'number' ? u.createdAt : 0,
    lastSeenAt: seen.length ? Math.max(...seen) : null,
    domain: domainOf(primary?.emailAddress),
    academic: emails.some((e) => e?.verification?.status === 'verified' && isAcademicDomain(domainOf(e?.emailAddress))),
    methods: [...methods],
    granted: meta?.[GRANT_KEY] === GRANT_VALUE,
    paidMirror: mirrorEntitles(readMirror(meta)),
    // the month's END only — the record also holds the address it began with, which stays where it is
    studentUntil: readStudentMonth(meta?.[STUDENT_KEY])?.until ?? null,
  };
}

async function readAccounts(): Promise<{ rows: AccountRow[] | null; total: number | null; health: SourceHealth }> {
  const label = 'Accounts (Clerk)';
  if (!process.env.CLERK_SECRET_KEY) {
    return { rows: null, total: null, health: { id: 'clerk', label, state: 'unconfigured', rows: 0, note: 'CLERK_SECRET_KEY is not set here' } };
  }
  try {
    const users = clerkClient().users;
    let total: number | null = null;
    try {
      total = await users.getCount();
    } catch {
      total = null;
    }
    const rows: AccountRow[] = [];
    for (let offset = 0; offset < CLERK_CAP; offset += CLERK_PAGE) {
      const res: any = await users.getUserList({ limit: CLERK_PAGE, offset, orderBy: '-created_at' });
      const data: any[] = Array.isArray(res) ? res : res?.data ?? [];
      if (total === null && typeof res?.totalCount === 'number') total = res.totalCount;
      for (const u of data) rows.push(toAccount(u));
      if (data.length < CLERK_PAGE) break;
    }
    const capped = rows.length >= CLERK_CAP;
    return { rows, total: total ?? rows.length, health: { id: 'clerk', label, state: capped ? 'truncated' : 'ok', rows: rows.length } };
  } catch (e) {
    return { rows: null, total: null, health: { id: 'clerk', label, state: 'error', rows: 0, note: e instanceof Error ? e.message.slice(0, 160) : 'unreachable' } };
  }
}

type Query = any;

function missingTable(error: { code?: string; message?: string } | null | undefined): boolean {
  const code = error?.code ?? '';
  return code === '42P01' || code === 'PGRST205' || /does not exist|could not find the table/i.test(error?.message ?? '');
}
function missingColumn(error: { code?: string } | null | undefined): boolean {
  return error?.code === '42703' || error?.code === 'PGRST204';
}

/**
 * Every row of one table, a page at a time, mapped as it arrives. `columns`
 * is a list of selects, richest first: a column a deployment has not added
 * yet narrows the read instead of failing it, as /api/profile does. `order`
 * is the table's whole primary key: paging over an order with ties can skip
 * or repeat a row at a page boundary.
 */
async function readTable<T>(
  id: string,
  label: string,
  table: string,
  columns: string[],
  order: string | string[],
  map: (r: any) => T | null,
  filter: (q: Query) => Query = (q) => q
): Promise<{ rows: T[]; health: SourceHealth; missing: boolean }> {
  let db;
  try {
    db = supabaseAdmin();
  } catch {
    return { rows: [], missing: false, health: { id, label, state: 'unconfigured', rows: 0, note: 'Supabase is not configured here' } };
  }
  for (const cols of columns) {
    const rows: T[] = [];
    let capped = false;
    let failed: { code?: string; message?: string } | null = null;
    for (let from = 0; ; from += DB_PAGE) {
      if (from >= DB_CAP) {
        capped = true;
        break;
      }
      let q = filter(db.from(table).select(cols));
      for (const o of Array.isArray(order) ? order : [order]) q = q.order(o, { ascending: true });
      const { data, error } = await q.range(from, from + DB_PAGE - 1);
      if (error) {
        failed = error;
        break;
      }
      for (const r of data ?? []) {
        const m = map(r);
        if (m) rows.push(m);
      }
      if (!data || data.length < DB_PAGE) break;
    }
    if (failed && missingColumn(failed) && cols !== columns[columns.length - 1]) continue;
    if (failed) {
      const missing = missingTable(failed);
      return { rows, missing, health: { id, label, state: missing ? 'missing' : 'error', rows: rows.length, note: missing ? `the ${table} table does not exist here` : (failed.message ?? failed.code ?? 'read failed').slice(0, 160) } };
    }
    return { rows, missing: false, health: { id, label, state: capped ? 'truncated' : 'ok', rows: rows.length, ...(cols !== columns[0] ? { note: 'an older schema: some columns are not there yet' } : {}) } };
  }
  return { rows: [], missing: false, health: { id, label, state: 'error', rows: 0 } };
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const ms = (v: unknown): number | null => {
  const n = num(v);
  if (n !== null) return n;
  const t = typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? t : null;
};

/** Everything the dashboard shows, read once. */
export async function collect(now = Date.now()): Promise<Collected> {
  const env = currentEnv();
  const [accounts, profiles, conversations, subscriptions, mail, referrals, grants, promos, events] = await Promise.all([
    readAccounts(),
    readTable<ProfileRow>('profiles', 'Onboarding progress and style (user_profiles)', 'user_profiles', ['user_id, first_run, conversation_style', 'user_id, first_run', 'user_id'], 'user_id', (r) =>
      r?.user_id
        ? (() => {
            const fr = parseFirstRun(r.first_run);
            return { userId: String(r.user_id), firstRun: fr.at, skipped: fr.skipped ?? [], style: typeof r.conversation_style === 'string' ? r.conversation_style : null };
          })()
        : null
    ),
    readTable<ConversationRow>('conversations', 'Conversations (owner, kind and times only)', 'conversations', ['user_id, kind, created_at, updated_at', 'user_id, created_at, updated_at'], 'id', (r) => {
      const created = ms(r?.created_at);
      const updated = ms(r?.updated_at) ?? created;
      return r?.user_id && updated !== null ? { userId: String(r.user_id), kind: typeof r.kind === 'string' ? r.kind : 'chat', createdAt: created ?? updated, updatedAt: updated } : null;
    }),
    readTable<SubscriptionRow>('subscriptions', 'Subscriptions', 'socria_subscriptions', ['user_id, status, current_period_end, cancel_at_period_end'], 'user_id', (r) =>
      r?.user_id ? { userId: String(r.user_id), status: String(r.status ?? ''), periodEnd: num(r.current_period_end), cancelAtPeriodEnd: !!r.cancel_at_period_end } : null
    ),
    readTable<MailRow>('mail', 'Newsletter ledger', 'lifecycle_emails', ['user_id, kind'], ['user_id', 'kind'], (r) => (r?.user_id ? { userId: String(r.user_id), kind: String(r.kind) } : null), (q) =>
      q.in('kind', ['newsletter', 'unsubscribed'])
    ),
    readTable<ReferralRow>('referrals', 'Referrals', 'referrals', ['user_id, via, created_at, activated_at'], 'user_id', (r) =>
      r?.user_id ? { userId: String(r.user_id), via: String(r.via ?? ''), createdAt: num(r.created_at) ?? 0, activatedAt: num(r.activated_at) } : null
    ),
    readTable<GrantRow>('grants', 'Rewards grants', 'promo_ledger', ['source, created_at'], 'key', (r) => ({ source: String(r?.source ?? ''), createdAt: num(r?.created_at) ?? 0 })),
    readTable<PromoRow>('promos', 'Rewards promo windows', 'promo_accounts', ['user_id, promo_until'], 'user_id', (r) => (r?.user_id ? { userId: String(r.user_id), promoUntil: num(r.promo_until) } : null)),
    readTable<EventRow>('events', 'Onboarding counters (product_events)', 'product_events', ['day, event, kind, n'], ['day', 'event', 'kind'], (r) =>
      r?.day && r?.event ? { day: String(r.day), event: String(r.event), kind: String(r.kind ?? ''), n: num(r.n) ?? 0 } : null,
      // this environment's counts only, for the last 400 days: enough for "all time" so far, and bounded
      (q) => q.eq('env', env).gte('day', dayOf(now - 400 * 86_400_000))
    ),
  ]);
  return {
    now,
    env,
    accounts: accounts.rows,
    accountsTotal: accounts.total,
    profiles: profiles.rows,
    conversations: conversations.rows,
    subscriptions: subscriptions.rows,
    mail: mail.rows,
    referrals: referrals.rows,
    grants: grants.rows,
    promos: promos.rows,
    events: events.missing ? null : events.rows,
    health: [accounts.health, profiles.health, conversations.health, subscriptions.health, mail.health, referrals.health, grants.health, promos.health, events.health],
  };
}
