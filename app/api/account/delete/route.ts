// app/api/account/delete/route.ts
// DELETE → erase the account and everything attached to it.
//
// Erasure is a right under the GDPR (art. 17) and the CCPA, and it has to be
// real: every row keyed to this user, in every table, then the account itself.
//
// Order matters. Our own data goes FIRST and the identity last, because a
// failure after the Clerk user is gone would strand rows whose owner can no
// longer sign in to ask again. If a table fails we stop and say so rather than
// report a success that did not happen.

import { NextRequest, NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import { purgeUserFromRooms } from '@/lib/logos-rooms-server';
import { ACCESS_COOKIE } from '@/lib/access-codes-server';
import { readSubscription, isCompCustomer } from '@/lib/subscriptions';
import { stripe, stripeConfigured } from '@/lib/stripe';
import { enforceRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Every table that keys rows to a user. Keep this list exhaustive.
 *
 * "Exhaustive" is now checked rather than asserted: test/account-data-complete
 * reads supabase/schema.sql and fails if a table there is missing from this
 * list or from the export. `logos_usage` was missing from both for several
 * releases — a person who asked to be forgotten kept a row of usage counters
 * keyed to their id — and it was missed precisely because adding a table and
 * adding it here are two separate acts, only one of which breaks anything.
 */
const OWNED_TABLES = [
  'conversations',
  'user_profiles',
  'logos_connections',
  'socria_subscriptions',
  'lifecycle_emails',
  'logos_usage',
  // The Mind Graph. Every row is keyed to one person, so a flat delete is
  // the right shape here — unlike the shared logos_room_* tables below.
  'mind_nodes',
  'mind_edges',
  'mind_tombstones',
  'mind_pending',
  'mind_sources',
  // Project containers. Their anchors are in mind_nodes above, so a flat
  // delete of both leaves nothing behind.
  'mind_projects',
  // Core 4's reasoning state: the per-conversation Cognitive State, the
  // Reasoning Ledger and its links, the content-free turn traces and the
  // capability evidence (lib/core4/store.ts CORE4_TABLES).
  'core4_state',
  'reasoning_entries',
  'reasoning_links',
  'core4_turns',
  'capability_evidence',
] as const;

/**
 * Tables that arrived in a later migration than the rest. On a database that
 * has not run it there is nothing of the person's in them, and refusing to
 * finish a deletion — after the subscription is already cancelled — over a
 * table that does not exist would be the wrong way round. Only a genuinely
 * missing table is forgiven; any other error still stops the deletion.
 */
const LATE_TABLES = new Set<string>([
  'lifecycle_emails',
  'mind_nodes',
  'mind_edges',
  'mind_tombstones',
  'mind_pending',
  'mind_sources',
  'mind_projects',
  'logos_usage',
  'logos_room_events',
  'logos_room_members',
  'logos_rooms',
  'core4_state',
  'reasoning_entries',
  'reasoning_links',
  'core4_turns',
  'capability_evidence',
]);

/**
 * Is this error "that table was never created", and nothing else?
 *
 * The bar is high because forgiving the wrong error is silent data loss: the
 * loop steps over the table, the route reports ok and names it in `deleted`,
 * and rows keyed to somebody who asked to be forgotten survive for ever with
 * no way left to reach them — the account that could delete them no longer
 * exists.
 *
 * It used to match a bare "does not exist" anywhere in code or message. That
 * phrase is Postgres's for a missing COLUMN, function, type or schema too,
 * and any of those on a live table means the delete failed while looking
 * like an absent migration. Now: the exact codes, or the exact phrasing
 * Postgres and PostgREST use for a missing relation.
 */
function tableMissing(error: { code?: string; message?: string }): boolean {
  const code = (error.code ?? '').toLowerCase();
  if (code === '42p01' || code === 'pgrst205') return true;
  const m = (error.message ?? '').toLowerCase();
  return (
    /relation "?[\w.]+"? does not exist/.test(m) ||
    /could not find the table/.test(m)
  );
}

export async function DELETE(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  // Deleting an account is irreversible, so it takes a deliberate confirmation
  // rather than a bare request that a stray click could produce.
  const body = await req.json().catch(() => ({}));
  if (body?.confirm !== 'DELETE') {
    return NextResponse.json(
      { error: 'Confirmation required.' },
      { status: 400 }
    );
  }

  const db = supabaseAdmin();
  const deleted: string[] = [];

  // Cancel billing BEFORE deleting anything. Stripe is the record of what
  // someone pays; dropping our projection without telling Stripe would leave a
  // live subscription charging an account that no longer exists — the worst
  // possible outcome of asking to be forgotten.
  let billingNote: string | null = null;
  try {
    // Fail closed on an unreadable billing row. `getSubscription` returns
    // null for both "no subscription" and "the query failed", so a database
    // hiccup here used to look exactly like "nothing to cancel" — the
    // deletion went ahead, Stripe was never told, and the person kept being
    // charged for an account that no longer existed.
    const read = await readSubscription(userId);
    if (!read.ok) {
      return NextResponse.json(
        {
          error:
            'We could not check your billing, so nothing was deleted — otherwise you could keep being charged for an account that no longer exists. Please try again in a moment, or email hellosocria@gmail.com.',
        },
        { status: 503 }
      );
    }
    const sub = read.row;
    if (sub?.subscriptionId && !isCompCustomer(sub.customerId) && stripeConfigured()) {
      await stripe().subscriptions.cancel(sub.subscriptionId);
      billingNote = 'Your Socria One subscription was cancelled.';
    }
  } catch (e) {
    console.error('account delete: could not cancel subscription', e);
    return NextResponse.json(
      {
        error:
          'We could not cancel your subscription, so nothing was deleted — otherwise you could keep being charged for an account that no longer exists. Please cancel in the billing portal first, or email hellosocria@gmail.com.',
      },
      { status: 500 }
    );
  }

  for (const table of OWNED_TABLES) {
    const { error } = await db.from(table).delete().eq('user_id', userId);
    if (error && LATE_TABLES.has(table) && tableMissing(error)) continue;
    if (error) {
      console.error(`account delete: ${table} failed`, error);
      return NextResponse.json(
        {
          error:
            'Could not delete everything, so nothing further was removed and your account still exists. Please email hellosocria@gmail.com and we will finish it by hand.',
          failedAt: table,
          deleted,
        },
        { status: 500 }
      );
    }
    deleted.push(table);
  }

  // Shared rooms, which a flat "delete every row with your id on it" cannot
  // express. purgeUserFromRooms removes THIS person's events and membership,
  // clears them as host so the other participant's events are not orphaned,
  // and drops rooms nobody is left in. The other participant's words stay —
  // they are that person's to export and to delete. See the deletion note in
  // supabase/schema.sql.
  try {
    await purgeUserFromRooms(userId, Date.now());
    deleted.push('logos_rooms');
  } catch (e) {
    // A database that has not run the collaboration migration genuinely has
    // nothing of theirs in it; anything else is a real failure and stops the
    // deletion, exactly like a failed table above. Swallowing it would report
    // a completed deletion that had left rooms behind.
    const m = e instanceof Error ? e.message.toLowerCase() : '';
    const missing =
      m.includes('42p01') || m.includes('does not exist') || m.includes('schema cache');
    if (!missing) {
      console.error('account delete: room purge', e);
      return NextResponse.json(
        {
          error:
            'Could not delete everything, so nothing further was removed and your account still exists. Please email hellosocria@gmail.com and we will finish it by hand.',
          failedAt: 'logos_rooms',
          deleted,
        },
        { status: 500 }
      );
    }
  }

  // The identity last.
  try {
    await clerkClient.users.deleteUser(userId);
  } catch (e) {
    console.error('account delete: clerk failed', e);
    return NextResponse.json(
      {
        error:
          'Your data was deleted, but the sign-in account could not be removed. Please email hellosocria@gmail.com so we can finish it.',
        deleted,
      },
      { status: 500 }
    );
  }

  // The unlock grant is an httpOnly cookie, so only the server can take it
  // back. An account that no longer exists must not leave one behind on a
  // shared device, where it would hand the next person an unlock the deleted
  // account had been given.
  const done = NextResponse.json({ ok: true, deleted, billingNote });
  done.cookies.set({
    name: ACCESS_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return done;
}
