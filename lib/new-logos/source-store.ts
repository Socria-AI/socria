// lib/new-logos/source-store.ts — WHERE SOURCES AND THEIR REFERENCES ARE KEPT, as an interface: the operations
// (source-ops.ts) are written against it, tested against the in-memory store below, and run in production against
// Supabase (source-store-supabase.ts). Every method is scoped to one owner.

import type { SourceMeta, SourceRefRow, SourceRow } from './sources';

export interface SourceStore {
  /** every source the person has, without readings (they can be large) */
  sources(userId: string): Promise<SourceMeta[]>;
  /** one source, with its reading */
  source(userId: string, id: string): Promise<SourceRow | null>;
  /** sources with their readings, by id */
  readings(userId: string, ids: string[]): Promise<SourceRow[]>;
  findByDoc(userId: string, docId: string): Promise<SourceMeta | null>;
  findByFile(userId: string, fileId: string): Promise<SourceMeta | null>;
  insertSource(row: SourceRow): Promise<void>;
  updateSource(userId: string, id: string, patch: Partial<SourceRow>): Promise<boolean>;
  /** its references go with it (the database's foreign key cascades) */
  deleteSource(userId: string, id: string): Promise<boolean>;
  refs(userId: string): Promise<SourceRefRow[]>;
  insertRef(row: SourceRefRow): Promise<void>;
  deleteRef(userId: string, id: string): Promise<boolean>;
  /** source id → the canvases it is placed on (from the person's canvas layouts) */
  placements(userId: string): Promise<Record<string, string[]>>;
  nodeExists(userId: string, nodeId: string): Promise<boolean>;
}

/** An in-memory store with the database's rules (cascades, uniqueness). For tests. */
export function memorySourceStore(seed: { nodes?: { id: string; user_id: string }[]; canvases?: { user_id: string; key: string; layout: unknown }[] } = {}): SourceStore & {
  nodes: { id: string; user_id: string }[];
  canvases: { user_id: string; key: string; layout: unknown }[];
} {
  const sources = new Map<string, SourceRow>();
  const refs = new Map<string, SourceRefRow>();
  const nodes = [...(seed.nodes ?? [])];
  const canvases = [...(seed.canvases ?? [])];
  const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
  const meta = (r: SourceRow): SourceMeta => {
    const { user_id: _u, reading: _r, ...m } = r;
    void _u;
    void _r;
    return copy(m);
  };
  return {
    nodes,
    canvases,
    async sources(userId) {
      return [...sources.values()].filter((s) => s.user_id === userId).map(meta);
    },
    async source(userId, id) {
      const s = sources.get(id);
      return s && s.user_id === userId ? copy(s) : null;
    },
    async readings(userId, ids) {
      return ids.map((id) => sources.get(id)).filter((s): s is SourceRow => !!s && s.user_id === userId).map(copy);
    },
    async findByDoc(userId, docId) {
      const s = [...sources.values()].find((x) => x.user_id === userId && x.doc_id === docId);
      return s ? meta(s) : null;
    },
    async findByFile(userId, fileId) {
      const s = [...sources.values()].find((x) => x.user_id === userId && x.file_id === fileId);
      return s ? meta(s) : null;
    },
    async insertSource(row) {
      if (sources.has(row.id)) throw new Error('duplicate id');
      if (row.doc_id && [...sources.values()].some((x) => x.user_id === row.user_id && x.doc_id === row.doc_id)) throw new Error('duplicate document (unique index)');
      sources.set(row.id, copy(row));
    },
    async updateSource(userId, id, patch) {
      const s = sources.get(id);
      if (!s || s.user_id !== userId) return false;
      sources.set(id, { ...s, ...copy(patch) });
      return true;
    },
    async deleteSource(userId, id) {
      const s = sources.get(id);
      if (!s || s.user_id !== userId) return false;
      sources.delete(id);
      for (const [k, r] of refs) if (r.source_id === id) refs.delete(k);
      return true;
    },
    async refs(userId) {
      return [...refs.values()].filter((r) => r.user_id === userId).map(copy);
    },
    async insertRef(row) {
      if (!sources.has(row.source_id)) throw new Error('source missing (foreign key)');
      if ([...refs.values()].some((r) => r.node_id === row.node_id && r.source_id === row.source_id && (r.passage ?? '') === (row.passage ?? ''))) throw new Error('duplicate reference (unique index)');
      refs.set(row.id, copy(row));
    },
    async deleteRef(userId, id) {
      const r = refs.get(id);
      if (!r || r.user_id !== userId) return false;
      refs.delete(id);
      return true;
    },
    async placements(userId) {
      const out: Record<string, string[]> = {};
      for (const c of canvases.filter((x) => x.user_id === userId)) {
        const items = ((c.layout as { items?: Record<string, unknown> })?.items ?? {}) as Record<string, unknown>;
        for (const ref of Object.keys(items)) if (ref.startsWith('s:')) (out[ref.slice(2)] ??= []).push(c.key);
      }
      return out;
    },
    async nodeExists(userId, nodeId) {
      return nodes.some((n) => n.id === nodeId && n.user_id === userId);
    },
  };
}
