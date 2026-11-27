// lib/new-logos/store.ts — WHERE NODES ARE KEPT, as an interface: the operations (ops.ts) are written against this,
// so the rules are tested against the in-memory store below and run in production against Supabase
// (store-supabase.ts). Every method is scoped to one owner; nothing reads or writes across accounts.

import type { NodeRow, RelationRow, VersionRow } from './model';

export interface NodeStore {
  /** every node the person owns, archived included */
  nodes(userId: string): Promise<NodeRow[]>;
  relations(userId: string): Promise<RelationRow[]>;
  insertNode(row: NodeRow): Promise<void>;
  /** Compare-and-swap on `version`: false when the stored version is not the one expected (changed elsewhere). */
  updateNode(userId: string, id: string, expectedVersion: number, patch: Partial<NodeRow>): Promise<boolean>;
  /** Refuses while the node still contains others (the database's parent_id foreign key says the same). */
  deleteNode(userId: string, id: string): Promise<void>;
  insertRelation(row: RelationRow): Promise<void>;
  deleteRelation(userId: string, id: string): Promise<boolean>;
  insertVersion(row: VersionRow): Promise<void>;
  versions(userId: string, nodeId: string): Promise<VersionRow[]>;
  /** drop versions numbered below `below` (retention) */
  pruneVersions(userId: string, nodeId: string, below: number): Promise<void>;
  /** whether a canonical conversation exists and is this person's */
  ownsConversation(userId: string, conversationId: string): Promise<boolean>;
}

/** The node tables are not in this database yet: organisation is unavailable, conversations are not affected. */
export class NlSetupError extends Error {
  constructor() {
    super('New Logos tables are missing: run supabase/schema.sql, then supabase/rls.sql.');
    this.name = 'NlSetupError';
  }
}

/** An in-memory store with the same rules the database enforces. For tests, and for nothing that must persist. */
export function memoryStore(seed: { conversations?: { id: string; user_id: string }[] } = {}): NodeStore & {
  conversations: { id: string; user_id: string }[];
} {
  const nodes = new Map<string, NodeRow>();
  const relations = new Map<string, RelationRow>();
  const versions = new Map<string, VersionRow>();
  const conversations = [...(seed.conversations ?? [])];
  const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
  return {
    conversations,
    async nodes(userId) {
      return [...nodes.values()].filter((n) => n.user_id === userId).map(copy);
    },
    async relations(userId) {
      return [...relations.values()].filter((r) => r.user_id === userId).map(copy);
    },
    async insertNode(row) {
      if (nodes.has(row.id)) throw new Error('duplicate id');
      if (row.parent_id && !nodes.has(row.parent_id)) throw new Error('parent missing (foreign key)');
      if (row.conversation_id && [...nodes.values()].some((n) => n.user_id === row.user_id && n.conversation_id === row.conversation_id))
        throw new Error('duplicate conversation node (unique index)');
      nodes.set(row.id, copy(row));
    },
    async updateNode(userId, id, expectedVersion, patch) {
      const n = nodes.get(id);
      if (!n || n.user_id !== userId || n.version !== expectedVersion) return false;
      if (patch.parent_id && !nodes.has(patch.parent_id)) throw new Error('parent missing (foreign key)');
      nodes.set(id, { ...n, ...copy(patch) });
      return true;
    },
    async deleteNode(userId, id) {
      const n = nodes.get(id);
      if (!n || n.user_id !== userId) return;
      if ([...nodes.values()].some((c) => c.parent_id === id)) throw new Error('still contains nodes (foreign key)');
      nodes.delete(id);
      for (const [k, r] of relations) if (r.from_id === id || r.to_id === id) relations.delete(k);
      for (const [k, v] of versions) if (v.node_id === id) versions.delete(k);
    },
    async insertRelation(row) {
      if (!nodes.has(row.from_id) || !nodes.has(row.to_id)) throw new Error('relation end missing (foreign key)');
      if ([...relations.values()].some((r) => r.user_id === row.user_id && r.from_id === row.from_id && r.to_id === row.to_id && r.kind === row.kind))
        throw new Error('duplicate relation (unique)');
      relations.set(row.id, copy(row));
    },
    async deleteRelation(userId, id) {
      const r = relations.get(id);
      if (!r || r.user_id !== userId) return false;
      relations.delete(id);
      return true;
    },
    async insertVersion(row) {
      versions.set(row.id, copy(row));
    },
    async versions(userId, nodeId) {
      return [...versions.values()].filter((v) => v.user_id === userId && v.node_id === nodeId).sort((a, b) => b.version - a.version).map(copy);
    },
    async pruneVersions(userId, nodeId, below) {
      for (const [k, v] of versions) if (v.user_id === userId && v.node_id === nodeId && v.version < below) versions.delete(k);
    },
    async ownsConversation(userId, conversationId) {
      return conversations.some((c) => c.id === conversationId && c.user_id === userId);
    },
  };
}
