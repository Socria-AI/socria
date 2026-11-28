// lib/new-logos/representation-store.ts — WHERE A WORKSPACE'S COMPONENTS ARE KEPT, as an interface: the operations
// (representation-service.ts) are written against it, tested against the in-memory store below, and run in production
// against Supabase (representation-store-supabase.ts, table nl_representations).
//
// One record per person and workspace — a workspace is keyed as its canvas is: c:<conversation id> (a conversation's
// space) or o:<objective node id> (an objective's). The record holds the workspace's components (its representation)
// and the log that can reverse each change. Writes are compare-and-swap on `version`, so a change made from a stale
// copy is refused and made again on the newer one.

import type { RepRecord } from './representation-ops';

export interface StoredRepresentation {
  record: RepRecord;
  version: number;
}

/** A workspace's key: c:<conversation id> or o:<objective node id> (the same keys canvases use). */
export const WORKSPACE_KEY_RE = /^(c|o):[A-Za-z0-9_-]{1,120}$/;

export interface RepresentationStore {
  read(userId: string, key: string): Promise<StoredRepresentation | null>;
  /** Save over `expected` (0: never saved). The new version, or null when another save came first. */
  write(userId: string, key: string, record: RepRecord, expected: number, now: number): Promise<number | null>;
  /** the workspace is this person's: their conversation (the existing conversations table), or their objective */
  owns(userId: string, key: string): Promise<boolean>;
}

/** An in-memory store with the database's rules (one row per person and workspace, versions). For tests. */
export function memoryRepresentationStore(seed: { conversations?: { id: string; user_id: string }[]; objectives?: { id: string; user_id: string }[] } = {}): RepresentationStore & {
  conversations: { id: string; user_id: string }[];
  objectives: { id: string; user_id: string }[];
  rows: Map<string, { user_id: string; key: string; body: unknown; version: number; updated_at: number }>;
} {
  const rows = new Map<string, { user_id: string; key: string; body: unknown; version: number; updated_at: number }>();
  const conversations = [...(seed.conversations ?? [])];
  const objectives = [...(seed.objectives ?? [])];
  const k = (u: string, key: string) => `${u}\u0000${key}`;
  const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
  return {
    conversations,
    objectives,
    rows,
    async read(userId, key) {
      const r = rows.get(k(userId, key));
      return r ? { record: copy(r.body) as RepRecord, version: r.version } : null;
    },
    async write(userId, key, record, expected, now) {
      const r = rows.get(k(userId, key));
      if ((r?.version ?? 0) !== expected) return null;
      rows.set(k(userId, key), { user_id: userId, key, body: copy(record), version: expected + 1, updated_at: now });
      return expected + 1;
    },
    async owns(userId, key) {
      if (!WORKSPACE_KEY_RE.test(key)) return false;
      const id = key.slice(2);
      return key.startsWith('c:') ? conversations.some((c) => c.id === id && c.user_id === userId) : objectives.some((o) => o.id === id && o.user_id === userId);
    },
  };
}
