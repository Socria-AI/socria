// lib/logos4/captures-store.ts — QUICK CAPTURE, ON THE SERVER.
//
// The `captures` table (supabase/schema.sql), read and written only here,
// always scoped to one Clerk user id. The table is deny-by-default under RLS
// (supabase/rls.sql); the service role is the only way in, and every query
// carries `.eq('user_id', …)` so one person's inbox is never another's.
//
// A deployment whose database has not run the migration is not an error the
// person has to understand: reads report `null` and the inbox keeps captures
// on the device instead, saying so.

import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { MAX_CAPTURES, cleanCapture, orderCaptures, type Capture } from './captures';

export class CaptureStoreError extends Error {
  constructor(
    public kind: 'unavailable' | 'full' | 'not-found' | 'failed',
    message: string = kind
  ) {
    super(message);
  }
}

const missingTable = (e: { code?: string; message?: string } | null | undefined) =>
  !!e && (['42P01', 'PGRST205'].includes(String(e.code)) || /relation .*captures.* does not exist/i.test(e.message ?? ''));

function fail(e: { code?: string; message?: string } | null | undefined): never {
  if (missingTable(e)) throw new CaptureStoreError('unavailable', 'Quick Capture is not set up on this deployment yet.');
  throw new CaptureStoreError('failed', 'The inbox could not be reached.');
}

interface Row {
  id: string;
  text: string;
  attachment: unknown;
  created_at: number;
  updated_at: number;
}

const fromRow = (r: Row): Capture | null => cleanCapture({ id: r.id, text: r.text, attachment: r.attachment ?? undefined, createdAt: Number(r.created_at), updatedAt: Number(r.updated_at) });
const toRow = (userId: string, c: Capture) => ({
  id: c.id,
  user_id: userId,
  text: c.text,
  attachment: c.attachment ?? null,
  created_at: c.createdAt,
  updated_at: c.updatedAt,
});

/** Their inbox, newest first — or null when the table does not exist here. */
export async function listCaptures(userId: string): Promise<Capture[] | null> {
  const { data, error } = await supabaseAdmin()
    .from('captures')
    .select('id, text, attachment, created_at, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(MAX_CAPTURES);
  if (error) {
    if (missingTable(error)) return null;
    fail(error);
  }
  return orderCaptures(((data ?? []) as Row[]).map(fromRow).filter((c): c is Capture => !!c));
}

/**
 * Keep new captures — one typed now, or a batch moved from the device.
 * An id already in the inbox is left as it is (a retried save, or the same
 * device moving twice), so nothing is duplicated and nothing is overwritten.
 */
export async function addCaptures(userId: string, list: readonly Capture[]): Promise<Capture[]> {
  const db = supabaseAdmin();
  const { data: have, error } = await db.from('captures').select('id').eq('user_id', userId).limit(MAX_CAPTURES + 1);
  if (error) fail(error);
  const known = new Set(((have ?? []) as { id: string }[]).map((r) => r.id));
  const fresh = orderCaptures(list).filter((c) => !known.has(c.id));
  if (!fresh.length) return [];
  if (known.size + fresh.length > MAX_CAPTURES) {
    throw new CaptureStoreError('full', `The inbox holds ${MAX_CAPTURES} captures. Delete a few you no longer need, then try again.`);
  }
  const { error: e2 } = await db.from('captures').upsert(fresh.map((c) => toRow(userId, c)), { onConflict: 'id', ignoreDuplicates: true });
  if (e2) fail(e2);
  return fresh;
}

/** Change a capture's words or attachment. Only the owner's row is touched. */
export async function updateCapture(userId: string, id: string, patch: { text: string; attachment: Capture['attachment'] | null }, now = Date.now()): Promise<Capture> {
  const db = supabaseAdmin();
  const { error, count } = await db
    .from('captures')
    .update({ text: patch.text, attachment: patch.attachment ?? null, updated_at: now }, { count: 'exact' })
    .eq('user_id', userId)
    .eq('id', id);
  if (error) fail(error);
  if (!count) throw new CaptureStoreError('not-found', 'That capture is no longer in the inbox.');
  const { data, error: e2 } = await db.from('captures').select('id, text, attachment, created_at, updated_at').eq('user_id', userId).eq('id', id).maybeSingle();
  if (e2) fail(e2);
  const c = data ? fromRow(data as Row) : null;
  if (!c) throw new CaptureStoreError('not-found', 'That capture is no longer in the inbox.');
  return c;
}

export async function deleteCapture(userId: string, id: string): Promise<void> {
  const { error } = await supabaseAdmin().from('captures').delete().eq('user_id', userId).eq('id', id);
  if (error) fail(error);
}
