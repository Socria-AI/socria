// lib/new-logos/representation-store-supabase.ts — workspaces' components over the existing Supabase project (server
// only).
//
// One row per person and workspace (nl_representations: user_id, key, body, version, updated_at), every query scoped
// to the owner, writes compare-and-swap on `version`. A database without the table raises NlSetupError: a conversation
// then answers turns as exchanges, as before, until the migration has run.

import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { missingTable } from './store-supabase';
import { NlSetupError } from './store';
import type { RepRecord } from './representation-ops';
import { WORKSPACE_KEY_RE, type RepresentationStore } from './representation-store';

function check(error: { code?: string; message?: string } | null, what: string) {
  if (!error) return;
  if (missingTable(error)) throw new NlSetupError();
  throw new Error(`${what}: ${error.message ?? error.code ?? 'database error'}`);
}

export function supabaseRepresentationStore(): RepresentationStore {
  const db = () => supabaseAdmin();
  return {
    async read(userId, key) {
      const { data, error } = await db().from('nl_representations').select('body, version').eq('user_id', userId).eq('key', key).maybeSingle();
      check(error, 'nl_representations select');
      if (!data) return null;
      const row = data as { body?: unknown; version?: unknown };
      return { record: (row.body ?? {}) as RepRecord, version: Number(row.version) || 1 };
    },
    async write(userId, key, record, expected, now) {
      if (expected > 0) {
        const { error, count } = await db()
          .from('nl_representations')
          .update({ body: record, version: expected + 1, updated_at: now }, { count: 'exact' })
          .eq('user_id', userId)
          .eq('key', key)
          .eq('version', expected);
        check(error, 'nl_representations update');
        return (count ?? 0) > 0 ? expected + 1 : null;
      }
      const { error } = await db().from('nl_representations').insert({ user_id: userId, key, body: record, version: 1, updated_at: now });
      if (error && /duplicate key|23505/i.test(`${error.code} ${error.message}`)) return null;
      check(error, 'nl_representations insert');
      return 1;
    },
    async owns(userId, key) {
      if (!WORKSPACE_KEY_RE.test(key)) return false;
      const id = key.slice(2);
      if (key.startsWith('c:')) {
        const { data, error } = await db().from('conversations').select('id').eq('id', id).eq('user_id', userId).maybeSingle();
        if (error) throw new Error(`conversations select: ${error.message}`);
        return !!data;
      }
      const { data, error } = await db().from('nl_nodes').select('id, type').eq('id', id).eq('user_id', userId).maybeSingle();
      if (error) {
        if (missingTable(error)) throw new NlSetupError();
        throw new Error(`nl_nodes select: ${error.message}`);
      }
      return !!data && (data as { type?: string }).type === 'objective';
    },
  };
}
