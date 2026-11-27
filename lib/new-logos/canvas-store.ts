// lib/new-logos/canvas-store.ts — canvas layouts over the existing Supabase project (server only).
//
// One row per person and canvas (nl_canvases: user_id, key, layout, version). Every query is scoped to the owner.
// Writes are compare-and-swap on `version`: a layout saved from a stale copy is refused (409) and the page merges
// its own changes into the newer one. A database without the table raises NlSetupError — the page then keeps the
// layout in the browser until the migration has run; nothing else depends on it.

import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { sanitizeLayout, type CanvasLayout } from './canvas';
import { missingTable } from './store-supabase';
import { NlSetupError } from './store';

export interface StoredCanvas {
  layout: CanvasLayout;
  version: number;
}

function check(error: { code?: string; message?: string } | null, what: string) {
  if (!error) return;
  if (missingTable(error)) throw new NlSetupError();
  throw new Error(`${what}: ${error.message ?? error.code ?? 'database error'}`);
}

export async function readCanvas(userId: string, key: string): Promise<StoredCanvas | null> {
  const { data, error } = await supabaseAdmin().from('nl_canvases').select('layout, version').eq('user_id', userId).eq('key', key).maybeSingle();
  check(error, 'nl_canvases select');
  if (!data) return null;
  const row = data as { layout?: unknown; version?: unknown };
  return { layout: sanitizeLayout(row.layout), version: Number(row.version) || 1 };
}

/** Save a layout over `expected` (0: a canvas never saved). The new version, or null when another save came first. */
export async function writeCanvas(userId: string, key: string, layout: CanvasLayout, expected: number, now: number): Promise<number | null> {
  const db = supabaseAdmin();
  if (expected > 0) {
    const { error, count } = await db
      .from('nl_canvases')
      .update({ layout, version: expected + 1, updated_at: now }, { count: 'exact' })
      .eq('user_id', userId)
      .eq('key', key)
      .eq('version', expected);
    check(error, 'nl_canvases update');
    return (count ?? 0) > 0 ? expected + 1 : null;
  }
  const { error } = await db.from('nl_canvases').insert({ user_id: userId, key, layout, version: 1, updated_at: now });
  if (error && /duplicate key|23505/i.test(`${error.code} ${error.message}`)) return null;
  check(error, 'nl_canvases insert');
  return 1;
}
