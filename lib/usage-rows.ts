// lib/usage-rows.ts — THE USAGE TABLE WITHOUT ITS FUNCTIONS.
//
// The counters in logos_usage are kept by SQL functions that take the row's lock (supabase/freemium.sql:
// consume_logos_usage, bump_logos_usage, refund_logos_usage; supabase/weekly-tokens.sql:
// reserve_logos_tokens, settle_logos_tokens). A database where they were never installed — or answer an
// error for any other reason — left the seven-day trial unable to begin or to hold a single token, and
// every first message said "Your trial can't be checked right now" (November 9, 2026). The free plan's
// own counting (lib/quota.ts) had always carried on without them; the trial had no such path.
//
// These are the same operations on the table alone, and as strict:
//   · a row is created with INSERT … ON CONFLICT DO NOTHING — of two requests at once, exactly one
//     creates it, and only that one is told it did (createOnce);
//   · a count is changed only WHERE n is still the value read (compare-and-set), so two requests at
//     once can never both be given the same last tokens: the loser matches nothing, reads again and
//     tries again (addTo).
// The functions stay the first choice wherever they answer; this is what runs when they do not.

import { supabaseAdmin } from './supabase';

/** One counter: a person (or a marker), a scope and a counter name — the table's primary key. */
export interface UsageRow {
  user: string;
  scope: string;
  counter: string;
}

const TABLE = 'logos_usage';

class UsageRowsFault extends Error {}
const fault = (what: string, e: { message?: string } | null | undefined) =>
  new UsageRowsFault(`usage ${what}: ${String(e?.message ?? 'no answer').slice(0, 160)}`);

const asCount = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);

/** The row's count; null when there is no row. Throws when the store cannot answer. */
export async function readCount(r: UsageRow): Promise<number | null> {
  const { data, error } = await supabaseAdmin().from(TABLE).select('n').eq('user_id', r.user).eq('scope', r.scope).eq('counter', r.counter).maybeSingle();
  if (error) throw fault('read', error);
  return data ? asCount((data as { n?: unknown }).n) : null;
}

/**
 * Create the row holding `n`, unless it is there already. True when THIS call created it (it was the
 * first); false when the row was there. Throws when the store cannot answer.
 */
export async function createOnce(r: UsageRow, n: number, at: number): Promise<boolean> {
  const { data, error } = await supabaseAdmin()
    .from(TABLE)
    .upsert({ user_id: r.user, scope: r.scope, counter: r.counter, n, updated_at: at }, { onConflict: 'user_id,scope,counter', ignoreDuplicates: true })
    .select('n');
  if (error) throw fault('create', error);
  return Array.isArray(data) && data.length > 0;
}

const pause = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

/**
 * Add `by` to the row's count, atomically and with no SQL function: the row is created at 0 when it is
 * missing, then changed only where its count is still the one read. A negative `by` takes away, never
 * below zero. With `limit` and a positive `by`: -1, and nothing changed, when the count would pass it.
 * The new count. Throws when the store cannot answer, or is contended past a few tries.
 */
export async function addTo(r: UsageRow, by: number, at: number, opts: { limit?: number | null } = {}): Promise<number> {
  const db = supabaseAdmin();
  for (let attempt = 0; attempt < 8; attempt++) {
    let cur = await readCount(r);
    if (cur === null) {
      await createOnce(r, 0, at);
      cur = (await readCount(r)) ?? 0;
    }
    const next = Math.max(0, cur + by);
    if (by > 0 && opts.limit !== null && opts.limit !== undefined && next > opts.limit) return -1;
    if (next === cur) return cur;
    const { data, error } = await db
      .from(TABLE)
      .update({ n: next, updated_at: at })
      .eq('user_id', r.user)
      .eq('scope', r.scope)
      .eq('counter', r.counter)
      .eq('n', cur)
      .select('n');
    if (error) throw fault('write', error);
    if (Array.isArray(data) && data.length > 0) return next;
    // another request changed the count between the read and the write: read again, after a moment
    await pause(5 + Math.floor(Math.random() * 20 * (attempt + 1)));
  }
  throw new UsageRowsFault('usage write: contended');
}
