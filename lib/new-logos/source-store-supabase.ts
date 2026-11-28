// lib/new-logos/source-store-supabase.ts — the SourceStore over the existing Supabase project (server only).
//
// Two tables, added by supabase/schema.sql and walled by supabase/rls.sql like every other: nl_sources (one record per
// file a person brought in: its name, kind, reading and the id of its original in the account's file storage) and
// nl_source_refs (a component's reference to a source). Every query is scoped with `.eq('user_id', userId)`. A database
// that has not run the new SQL raises NlSetupError, which the routes answer as `{ setup: false }`.

import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { sanitizeSourceDoc } from '@/lib/docs/sanitize';
import { GROUNDS, type Ground } from '@/lib/docs/types';
import { missingTable } from './store-supabase';
import { NlSetupError } from './store';
import { SOURCE_KINDS, SOURCE_STATUSES, type SourceKind, type SourceMeta, type SourceRefRow, type SourceRow, type SourceStatus } from './sources';
import type { SourceStore } from './source-store';

type PgError = { code?: string; message?: string } | null;
function check(error: PgError, what: string): void {
  if (!error) return;
  if (missingTable(error)) throw new NlSetupError();
  throw new Error(`${what}: ${error.message ?? error.code ?? 'database error'}`);
}
const num = (v: unknown, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const META = 'id, name, file_name, mime, size, kind, file_id, doc_id, status, pages, format, conversation_ids, created_at, updated_at';

function metaOf(r: Record<string, unknown>): SourceMeta {
  return {
    id: String(r.id),
    name: String(r.name ?? ''),
    file_name: String(r.file_name ?? ''),
    mime: String(r.mime ?? ''),
    size: num(r.size),
    kind: (SOURCE_KINDS as readonly string[]).includes(r.kind as string) ? (r.kind as SourceKind) : 'document',
    file_id: r.file_id ? String(r.file_id) : null,
    doc_id: r.doc_id ? String(r.doc_id) : null,
    status: (SOURCE_STATUSES as readonly string[]).includes(r.status as string) ? (r.status as SourceStatus) : 'ready',
    pages: num(r.pages),
    format: String(r.format ?? ''),
    conversation_ids: Array.isArray(r.conversation_ids) ? (r.conversation_ids as unknown[]).map(String) : [],
    created_at: num(r.created_at),
    updated_at: num(r.updated_at),
  };
}
const rowOf = (r: Record<string, unknown>): SourceRow => ({ ...metaOf(r), user_id: String(r.user_id), reading: r.reading ? sanitizeSourceDoc(r.reading) : null });
const refOf = (r: Record<string, unknown>): SourceRefRow => ({
  id: String(r.id),
  user_id: String(r.user_id),
  source_id: String(r.source_id),
  node_id: String(r.node_id),
  passage: r.passage ? String(r.passage) : null,
  quote: String(r.quote ?? ''),
  note: String(r.note ?? ''),
  ground: (GROUNDS as readonly string[]).includes(r.ground as string) ? (r.ground as Ground) : null,
  origin: r.origin === 'ai' ? 'ai' : 'human',
  created_at: num(r.created_at),
});

export function supabaseSourceStore(): SourceStore {
  const db = () => supabaseAdmin();
  return {
    async sources(userId) {
      const { data, error } = await db().from('nl_sources').select(META).eq('user_id', userId).order('created_at', { ascending: false });
      check(error, 'nl_sources select');
      return (data ?? []).map((r) => metaOf(r as Record<string, unknown>));
    },
    async source(userId, id) {
      const { data, error } = await db().from('nl_sources').select('*').eq('user_id', userId).eq('id', id).maybeSingle();
      check(error, 'nl_sources select one');
      return data ? rowOf(data as Record<string, unknown>) : null;
    },
    async readings(userId, ids) {
      if (!ids.length) return [];
      const { data, error } = await db().from('nl_sources').select('*').eq('user_id', userId).in('id', ids);
      check(error, 'nl_sources readings');
      return (data ?? []).map((r) => rowOf(r as Record<string, unknown>));
    },
    async findByDoc(userId, docId) {
      const { data, error } = await db().from('nl_sources').select(META).eq('user_id', userId).eq('doc_id', docId).maybeSingle();
      check(error, 'nl_sources by document');
      return data ? metaOf(data as Record<string, unknown>) : null;
    },
    async findByFile(userId, fileId) {
      const { data, error } = await db().from('nl_sources').select(META).eq('user_id', userId).eq('file_id', fileId).limit(1);
      check(error, 'nl_sources by file');
      return data?.[0] ? metaOf(data[0] as Record<string, unknown>) : null;
    },
    async insertSource(row) {
      const { error } = await db().from('nl_sources').insert(row);
      check(error, 'nl_sources insert');
    },
    async updateSource(userId, id, patch) {
      const { error, count } = await db().from('nl_sources').update(patch, { count: 'exact' }).eq('user_id', userId).eq('id', id);
      check(error, 'nl_sources update');
      return (count ?? 0) > 0;
    },
    async deleteSource(userId, id) {
      // its references first (the foreign key cascades too; saying it here keeps the rule visible and certain)
      const refs = await db().from('nl_source_refs').delete().eq('user_id', userId).eq('source_id', id);
      check(refs.error, 'nl_source_refs delete for source');
      const { error, count } = await db().from('nl_sources').delete({ count: 'exact' }).eq('user_id', userId).eq('id', id);
      check(error, 'nl_sources delete');
      return (count ?? 0) > 0;
    },
    async refs(userId) {
      const { data, error } = await db().from('nl_source_refs').select('*').eq('user_id', userId);
      check(error, 'nl_source_refs select');
      return (data ?? []).map((r) => refOf(r as Record<string, unknown>));
    },
    async insertRef(row) {
      const { error } = await db().from('nl_source_refs').insert(row);
      check(error, 'nl_source_refs insert');
    },
    async deleteRef(userId, id) {
      const { error, count } = await db().from('nl_source_refs').delete({ count: 'exact' }).eq('user_id', userId).eq('id', id);
      check(error, 'nl_source_refs delete');
      return (count ?? 0) > 0;
    },
    async placements(userId) {
      // the person's canvas layouts, read for the s:<id> items they hold; no canvases table yet means no placements
      const { data, error } = await db().from('nl_canvases').select('key, layout').eq('user_id', userId);
      if (error) {
        if (missingTable(error)) return {};
        check(error, 'nl_canvases select');
      }
      const out: Record<string, string[]> = {};
      for (const c of data ?? []) {
        const items = ((c as { layout?: { items?: Record<string, unknown> } }).layout?.items ?? {}) as Record<string, unknown>;
        for (const ref of Object.keys(items)) if (ref.startsWith('s:')) (out[ref.slice(2)] ??= []).push(String((c as { key: string }).key));
      }
      return out;
    },
    async nodeExists(userId, nodeId) {
      const { data, error } = await db().from('nl_nodes').select('id').eq('user_id', userId).eq('id', nodeId).limit(1);
      check(error, 'nl_nodes exists');
      return !!data?.length;
    },
  };
}
