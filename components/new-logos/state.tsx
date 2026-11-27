'use client';
// components/new-logos/state.tsx — what New Logos holds in the browser, and the only place it writes from.
//
// Two sources, never mixed:
//   • nodes and relations — /api/new-logos/* (organisation, owned by New Logos);
//   • conversations — the existing /api/conversations, the single source of truth both interfaces read and write.
// Both are re-read when the tab comes back into view and every 25 seconds while it is visible, so what was said or
// changed in the other interface appears here without a reload.
//
// A conversation save is always built from the FRESHEST canonical row: the list is read, the turns this page added
// are put after what is stored, and the whole row goes back with the version it was read at. The server merges if
// another write landed in between (lib/new-logos/convo.ts says why the whole row must travel).

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { NodeRow, RelationRow } from '@/lib/new-logos/model';
import { mergeConversations, saveBody, type Conversation, type StoredMessage } from '@/lib/new-logos/convo';

type Json = Record<string, unknown>;

export interface NodeResult {
  ok: boolean;
  node?: NodeRow;
  error?: string;
  code?: string;
}

interface Ctx {
  loaded: boolean;
  /** false: the node tables are not in the database yet (organisation unavailable); null: not known yet */
  setup: boolean | null;
  nodes: NodeRow[];
  relations: RelationRow[];
  conversations: Map<string, Conversation>;
  conversationsLoaded: boolean;
  loadError: string | null;
  notice: string | null;
  say: (text: string | null) => void;
  refresh: () => Promise<void>;
  createNode: (input: Json) => Promise<NodeResult>;
  nodeAction: (id: string, action: string, extra?: Json) => Promise<NodeResult>;
  deleteNode: (id: string) => Promise<{ ok: boolean; error?: string }>;
  link: (fromId: string, toId: string, kind: string, note?: string) => Promise<{ ok: boolean; error?: string }>;
  unlink: (id: string) => Promise<{ ok: boolean; error?: string }>;
  versions: (id: string) => Promise<{ version: number; snapshot: Json; created_at: number }[]>;
  /** append turns to a conversation (creating it when `create` holds its title) */
  appendTurns: (id: string, turns: StoredMessage[], create?: { title: string }) => Promise<{ ok: boolean; gone?: boolean }>;
  rename: (id: string, title: string) => Promise<boolean>;
  /** mark a conversation as being written here, so a background refresh does not replace the local copy */
  hold: (id: string, on: boolean) => void;
  putLocal: (c: Conversation) => void;
}

const NLContext = createContext<Ctx | null>(null);

export function useNL(): Ctx {
  const c = useContext(NLContext);
  if (!c) throw new Error('useNL outside NLProvider');
  return c;
}

async function readJson(res: Response): Promise<Json> {
  try {
    return (await res.json()) as Json;
  } catch {
    return {};
  }
}

export function NLProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const [setup, setSetup] = useState<boolean | null>(null);
  const [nodes, setNodes] = useState<NodeRow[]>([]);
  const [relations, setRelations] = useState<RelationRow[]>([]);
  const [conversations, setConversations] = useState<Map<string, Conversation>>(new Map());
  const [conversationsLoaded, setConversationsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const busy = useRef<Set<string>>(new Set());
  // the latest nodes, read by writes queued behind one another (a write's version is the one the last write left)
  const nodesRef = useRef<NodeRow[]>([]);
  nodesRef.current = nodes;
  const queue = useRef<Map<string, Promise<unknown>>>(new Map());
  const convRef = useRef(conversations);
  convRef.current = conversations;

  const say = useCallback((t: string | null) => setNotice(t), []);
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(t);
  }, [notice]);

  const fetchConversations = useCallback(async (): Promise<Conversation[] | null> => {
    const res = await fetch('/api/conversations', { cache: 'no-store' });
    if (res.status === 401) {
      window.location.href = '/new-logos/sign-in';
      return null;
    }
    if (!res.ok) return null;
    const j = await readJson(res);
    return Array.isArray(j.conversations) ? (j.conversations as Conversation[]).map((c) => ({ ...c, messages: Array.isArray(c.messages) ? c.messages : [] })) : [];
  }, []);

  const refreshNodes = useCallback(async () => {
    const res = await fetch('/api/new-logos/nodes', { cache: 'no-store' });
    if (res.status === 401) {
      window.location.href = '/new-logos/sign-in';
      return;
    }
    const j = await readJson(res);
    if (j.setup === false) {
      setSetup(false);
      nodesRef.current = [];
      setNodes([]);
      setRelations([]);
      return;
    }
    if (!res.ok) throw new Error('nodes');
    setSetup(true);
    nodesRef.current = (j.nodes as NodeRow[]) ?? [];
    setNodes((j.nodes as NodeRow[]) ?? []);
    setRelations((j.relations as RelationRow[]) ?? []);
  }, []);

  const refresh = useCallback(async () => {
    const [n, c] = await Promise.allSettled([refreshNodes(), fetchConversations()]);
    if (c.status === 'fulfilled' && c.value) {
      setConversations((held) => mergeConversations(held, c.value as Conversation[], busy.current));
      setConversationsLoaded(true);
    }
    if (n.status === 'rejected' && c.status !== 'fulfilled') setLoadError('Your work could not be loaded. Check the connection and reload.');
    else setLoadError(null);
    setLoaded(true);
  }, [refreshNodes, fetchConversations]);

  useEffect(() => {
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 25_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.clearInterval(timer);
    };
  }, [refresh]);

  const upsertNode = useCallback((n: NodeRow) => {
    nodesRef.current = nodesRef.current.some((x) => x.id === n.id) ? nodesRef.current.map((x) => (x.id === n.id ? n : x)) : [...nodesRef.current, n];
    setNodes((all) => (all.some((x) => x.id === n.id) ? all.map((x) => (x.id === n.id ? n : x)) : [...all, n]));
  }, []);

  const failed = useCallback(
    async (res: Response, j: Json): Promise<string> => {
      if (j.code === 'conflict') await refreshNodes().catch(() => {});
      if (j.code === 'setup') setSetup(false);
      return typeof j.error === 'string' ? j.error : 'That did not work. Nothing was changed.';
    },
    [refreshNodes]
  );

  const createNode = useCallback(
    async (input: Json): Promise<NodeResult> => {
      const res = await fetch('/api/new-logos/nodes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
      const j = await readJson(res);
      if (!res.ok || !j.node) return { ok: false, error: await failed(res, j), code: j.code as string };
      upsertNode(j.node as NodeRow);
      return { ok: true, node: j.node as NodeRow };
    },
    [failed, upsertNode]
  );

  // Writes to one node go one after another, each with the version the previous one left — two quick edits (a title,
  // then a description) are never refused as a conflict with each other.
  const nodeAction = useCallback(
    (id: string, action: string, extra: Json = {}): Promise<NodeResult> => {
      const run = async (): Promise<NodeResult> => {
        const version = nodesRef.current.find((n) => n.id === id)?.version;
        const res = await fetch(`/api/new-logos/nodes/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, version, ...extra }),
        });
        const j = await readJson(res);
        if (!res.ok || !j.node) return { ok: false, error: await failed(res, j), code: j.code as string };
        upsertNode(j.node as NodeRow);
        return { ok: true, node: j.node as NodeRow };
      };
      const prev = queue.current.get(id) ?? Promise.resolve();
      const next = prev.then(run, run);
      queue.current.set(id, next.catch(() => undefined));
      return next;
    },
    [failed, upsertNode]
  );

  const deleteNode = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/new-logos/nodes/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const j = await readJson(res);
      if (!res.ok) return { ok: false, error: await failed(res, j) };
      setNodes((all) => all.filter((n) => n.id !== id));
      setRelations((all) => all.filter((r) => r.from_id !== id && r.to_id !== id));
      return { ok: true };
    },
    [failed]
  );

  const link = useCallback(
    async (fromId: string, toId: string, kind: string, note = '') => {
      const res = await fetch('/api/new-logos/relations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fromId, toId, kind, note }) });
      const j = await readJson(res);
      if (!res.ok || !j.relation) return { ok: false, error: await failed(res, j) };
      setRelations((all) => [...all, j.relation as RelationRow]);
      return { ok: true };
    },
    [failed]
  );

  const unlink = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/new-logos/relations/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const j = await readJson(res);
      if (!res.ok) return { ok: false, error: await failed(res, j) };
      setRelations((all) => all.filter((r) => r.id !== id));
      return { ok: true };
    },
    [failed]
  );

  const versions = useCallback(async (id: string) => {
    const res = await fetch(`/api/new-logos/nodes/${encodeURIComponent(id)}`, { cache: 'no-store' });
    const j = await readJson(res);
    return Array.isArray(j.versions) ? (j.versions as { version: number; snapshot: Json; created_at: number }[]) : [];
  }, []);

  const hold = useCallback((id: string, on: boolean) => {
    if (on) busy.current.add(id);
    else busy.current.delete(id);
  }, []);

  const putLocal = useCallback((c: Conversation) => {
    setConversations((held) => {
      const next = new Map(held);
      next.set(c.id, c);
      return next;
    });
  }, []);

  const appendTurns = useCallback(
    async (id: string, turns: StoredMessage[], create?: { title: string }): Promise<{ ok: boolean; gone?: boolean }> => {
      const list = await fetchConversations();
      if (!list) return { ok: false };
      const stored = list.find((c) => c.id === id);
      let res: Response;
      if (stored) {
        const have = new Set(stored.messages.map((m) => m.id).filter(Boolean));
        const next: Conversation = { ...stored, messages: [...stored.messages, ...turns.filter((m) => !m.id || !have.has(m.id))] };
        res = await fetch('/api/conversations', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(saveBody(next, stored.updatedAt, true, Date.now())) });
      } else if (create) {
        const next: Conversation = { id, title: create.title, messages: turns, kind: 'logos', updatedAt: Date.now() };
        res = await fetch('/api/conversations', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(saveBody(next, null, false, Date.now())) });
      } else {
        return { ok: false, gone: true };
      }
      if (res.status === 410) return { ok: false, gone: true };
      if (!res.ok) return { ok: false };
      const fresh = await fetchConversations();
      if (fresh) {
        busy.current.delete(id);
        setConversations((held) => mergeConversations(held, fresh, busy.current));
      }
      return { ok: true };
    },
    [fetchConversations]
  );

  const rename = useCallback(async (id: string, title: string) => {
    const res = await fetch('/api/conversations', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, title }) });
    if (!res.ok) return false;
    setConversations((held) => {
      const c = held.get(id);
      if (!c) return held;
      const next = new Map(held);
      next.set(id, { ...c, title });
      return next;
    });
    return true;
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      loaded,
      setup,
      nodes,
      relations,
      conversations,
      conversationsLoaded,
      loadError,
      notice,
      say,
      refresh,
      createNode,
      nodeAction,
      deleteNode,
      link,
      unlink,
      versions,
      appendTurns,
      rename,
      hold,
      putLocal,
    }),
    [loaded, setup, nodes, relations, conversations, conversationsLoaded, loadError, notice, say, refresh, createNode, nodeAction, deleteNode, link, unlink, versions, appendTurns, rename, hold, putLocal]
  );

  return <NLContext.Provider value={value}>{children}</NLContext.Provider>;
}
