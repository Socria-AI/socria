// lib/new-logos/store-supabase.ts — the NodeStore over the existing Supabase project (server only).
//
// Three tables, added by supabase/schema.sql and walled by supabase/rls.sql like every other: nl_nodes,
// nl_relations, nl_node_versions. Conversations are NOT here — a conversation node points at conversations.id, and
// the conversations table stays the one source of truth that the existing application also reads and writes.
//
// Every query is scoped to the owner with `.eq('user_id', userId)`: the service role bypasses RLS, so this filter is
// what keeps accounts apart (supabase/rls.sql explains the second wall). A database that has not run the new SQL yet
// raises NlSetupError, which the routes turn into `{ setup: false }` — conversations keep working without it.

import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { sanitizeProvenance, type NodeRow, type RelationRow, type VersionRow } from './model';
import { NlSetupError, type NodeStore } from './store';

type PgError = { code?: string; message?: string } | null;

/** Postgres says 42P01 for a missing table; PostgREST says PGRST205 ("Could not find the table … in the schema cache"). */
export function missingTable(error: PgError): boolean {
  if (!error) return false;
  if (error.code === '42P01' || error.code === 'PGRST205') return true;
  return /relation .* does not exist|could not find the table/i.test(error.message ?? '');
}

function check(error: PgError, what: string): void {
  if (!error) return;
  if (missingTable(error)) throw new NlSetupError();
  throw new Error(`${what}: ${error.message ?? error.code ?? 'database error'}`);
}

const num = (v: unknown, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

function nodeOf(r: Record<string, unknown>): NodeRow {
  return {
    id: String(r.id),
    user_id: String(r.user_id),
    type: r.type as NodeRow['type'],
    title: String(r.title ?? ''),
    description: String(r.description ?? ''),
    parent_id: r.parent_id ? String(r.parent_id) : null,
    conversation_id: r.conversation_id ? String(r.conversation_id) : null,
    content: obj(r.content),
    state: String(r.state ?? ''),
    provenance: sanitizeProvenance(r.provenance),
    position: num(r.position),
    archived_at: r.archived_at === null || r.archived_at === undefined ? null : num(r.archived_at),
    version: num(r.version, 1),
    created_at: num(r.created_at),
    updated_at: num(r.updated_at),
  };
}

function relationOf(r: Record<string, unknown>): RelationRow {
  return {
    id: String(r.id),
    user_id: String(r.user_id),
    from_id: String(r.from_id),
    to_id: String(r.to_id),
    kind: r.kind as RelationRow['kind'],
    note: String(r.note ?? ''),
    provenance: sanitizeProvenance(r.provenance),
    created_at: num(r.created_at),
  };
}

export function supabaseStore(): NodeStore {
  const db = () => supabaseAdmin();
  return {
    async nodes(userId) {
      const { data, error } = await db().from('nl_nodes').select('*').eq('user_id', userId).limit(10000);
      check(error, 'nl_nodes select');
      return (data ?? []).map((r) => nodeOf(r as Record<string, unknown>));
    },
    async relations(userId) {
      const { data, error } = await db().from('nl_relations').select('*').eq('user_id', userId).limit(40000);
      check(error, 'nl_relations select');
      return (data ?? []).map((r) => relationOf(r as Record<string, unknown>));
    },
    async insertNode(row) {
      const { error } = await db().from('nl_nodes').insert(row);
      check(error, 'nl_nodes insert');
    },
    async updateNode(userId, id, expectedVersion, patch) {
      const { error, count } = await db()
        .from('nl_nodes')
        .update(patch, { count: 'exact' })
        .eq('id', id)
        .eq('user_id', userId)
        .eq('version', expectedVersion);
      check(error, 'nl_nodes update');
      return (count ?? 0) > 0;
    },
    async deleteNode(userId, id) {
      const { error } = await db().from('nl_nodes').delete().eq('id', id).eq('user_id', userId);
      check(error, 'nl_nodes delete');
    },
    async insertRelation(row) {
      const { error } = await db().from('nl_relations').insert(row);
      check(error, 'nl_relations insert');
    },
    async deleteRelation(userId, id) {
      const { error, count } = await db().from('nl_relations').delete({ count: 'exact' }).eq('id', id).eq('user_id', userId);
      check(error, 'nl_relations delete');
      return (count ?? 0) > 0;
    },
    async insertVersion(row: VersionRow) {
      const { error } = await db().from('nl_node_versions').insert(row);
      check(error, 'nl_node_versions insert');
    },
    async versions(userId, nodeId) {
      const { data, error } = await db()
        .from('nl_node_versions')
        .select('*')
        .eq('user_id', userId)
        .eq('node_id', nodeId)
        .order('version', { ascending: false })
        .limit(100);
      check(error, 'nl_node_versions select');
      return (data ?? []).map((r) => {
        const x = r as Record<string, unknown>;
        return {
          id: String(x.id),
          node_id: String(x.node_id),
          user_id: String(x.user_id),
          version: num(x.version),
          snapshot: obj(x.snapshot) as unknown as VersionRow['snapshot'],
          created_at: num(x.created_at),
        };
      });
    },
    async pruneVersions(userId, nodeId, below) {
      const { error } = await db().from('nl_node_versions').delete().eq('user_id', userId).eq('node_id', nodeId).lt('version', below);
      check(error, 'nl_node_versions prune');
    },
    async ownsConversation(userId, conversationId) {
      const { data, error } = await db().from('conversations').select('id').eq('id', conversationId).eq('user_id', userId).maybeSingle();
      if (error) throw new Error(`conversations select: ${error.message}`);
      return !!data;
    },
  };
}
