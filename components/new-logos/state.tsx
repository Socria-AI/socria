'use client';
// components/new-logos/state.tsx — what New Logos holds in the browser, and the only place it writes from.
//
// Two sources, never mixed:
//   • nodes and relations — /api/new-logos/* (organisation, owned by New Logos);
//   • conversations — the existing /api/conversations, the single source of truth both interfaces read and write.
// Both are re-read when the tab comes back into view and every 25 seconds while it is visible, so what was said or
// changed in the other interface appears here without a reload.
//
// An artifact changes by OPERATIONS (lib/new-logos/artifact-ops.ts): applied here at once, so a slider or a drag
// answers immediately; gathered for a moment and coalesced (forty slider values become one); then sent, behind any
// other write to that node, to be applied on the server to what is stored. Until the server answers, what is shown is
// the last stored composition with the unsent and unanswered operations applied on top — so a background refresh, or
// another write's answer, never takes back an edit that is still on its way.
//
// A conversation save is always built from the FRESHEST canonical row: the list is read, the turns this page added
// are put after what is stored, and the whole row goes back with the version it was read at. The server merges if
// another write landed in between (lib/new-logos/convo.ts says why the whole row must travel).

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { NodeRow, RelationRow } from '@/lib/new-logos/model';
import { mergeConversations, saveBody, type Conversation, type StoredMessage } from '@/lib/new-logos/convo';
import { applyOps, coalesce, type ArtifactOp } from '@/lib/new-logos/artifact-ops';
import { sanitizeComposition } from '@/lib/new-logos/primitives';

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
  /** change an artifact's composition: shown at once, saved shortly after */
  artifactOps: (id: string, ops: ArtifactOp[]) => boolean;
  /** artifacts with changes not yet saved: 'saving', or 'retrying' after a failed attempt */
  artifactSaving: Record<string, 'saving' | 'retrying'>;
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
  // artifacts with operations on their way: the last stored node, and the operations not yet stored
  const confirmed = useRef<Map<string, NodeRow>>(new Map());
  const outbox = useRef<Map<string, { pending: ArtifactOp[]; inflight: ArtifactOp[]; timer: number | null; first: number; fails: number }>>(new Map());
  const [artifactSaving, setArtifactSaving] = useState<Record<string, 'saving' | 'retrying'>>({});
  // the newest version of each node the server has shown this page: an answer older than that (a slow refresh that
  // left before a save landed) never replaces what is newer
  const seen = useRef<Map<string, number>>(new Map());
  const note = (n: NodeRow) => {
    if ((seen.current.get(n.id) ?? 0) < n.version) seen.current.set(n.id, n.version);
  };
  const stale = (n: NodeRow) => n.version < (seen.current.get(n.id) ?? 0);

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

  /** An artifact as it should be shown: the last stored node with the operations not yet stored applied. */
  const shown = (id: string): NodeRow | null => {
    const base = confirmed.current.get(id);
    const box = outbox.current.get(id);
    if (!base || !box) return null;
    const r = applyOps(sanitizeComposition(base.content), [...box.inflight, ...box.pending]);
    return r.ok ? { ...base, content: r.comp as unknown as Record<string, unknown> } : base;
  };

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
    // an artifact with operations still on their way is shown as stored plus those operations
    const fresh = ((j.nodes as NodeRow[]) ?? []).map((n) => {
      if (stale(n)) return nodesRef.current.find((x) => x.id === n.id) ?? n;
      note(n);
      if (!outbox.current.has(n.id)) return n;
      const held = confirmed.current.get(n.id);
      if (!held || n.version >= held.version) confirmed.current.set(n.id, n);
      return shown(n.id) ?? n;
    });
    nodesRef.current = fresh;
    setNodes(fresh);
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

  const putNode = useCallback((n: NodeRow) => {
    nodesRef.current = nodesRef.current.some((x) => x.id === n.id) ? nodesRef.current.map((x) => (x.id === n.id ? n : x)) : [...nodesRef.current, n];
    setNodes((all) => (all.some((x) => x.id === n.id) ? all.map((x) => (x.id === n.id ? n : x)) : [...all, n]));
  }, []);
  /** A node as the server returned it; an artifact with operations still on their way keeps them on top. */
  const upsertNode = useCallback(
    (n: NodeRow) => {
      if (stale(n)) return;
      note(n);
      if (outbox.current.has(n.id)) {
        const held = confirmed.current.get(n.id);
        if (!held || n.version >= held.version) confirmed.current.set(n.id, n);
        putNode(shown(n.id) ?? n);
        return;
      }
      putNode(n);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [putNode]
  );

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

  // ── artifact operations ──
  const markSaving = useCallback((id: string, v: 'saving' | 'retrying' | null) => {
    setArtifactSaving((s) => {
      if ((s[id] ?? null) === v) return s;
      const next = { ...s };
      if (v) next[id] = v;
      else delete next[id];
      return next;
    });
  }, []);

  const sendOps = useRef<(id: string) => void>(() => {});
  const scheduleOps = useCallback((id: string) => {
    const box = outbox.current.get(id);
    if (!box || box.inflight.length || !box.pending.length) return;
    if (box.timer) window.clearTimeout(box.timer);
    // a short pause after the last change, but never long while changes keep coming (a slider held down)
    const wait = Math.max(0, Math.min(450, 1400 - (Date.now() - box.first)));
    box.timer = window.setTimeout(() => sendOps.current(id), wait);
  }, []);

  sendOps.current = (id: string) => {
    const box = outbox.current.get(id);
    if (!box || box.inflight.length || !box.pending.length) return;
    box.timer = null;
    // as many as one request may carry (the server takes 100 operations and 400k characters at most); the rest go
    // next, so edits gathered while offline are never refused for their number
    const all = coalesce(box.pending);
    const chunk: ArtifactOp[] = [];
    let size = 0;
    for (const op of all) {
      const n = JSON.stringify(op).length;
      if (chunk.length && (chunk.length >= 80 || size + n > 300_000)) break;
      chunk.push(op);
      size += n;
    }
    box.inflight = chunk;
    box.pending = all.slice(chunk.length);
    const run = async () => {
      let res: Response | null = null;
      let j: Json = {};
      try {
        res = await fetch(`/api/new-logos/nodes/${encodeURIComponent(id)}/ops`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ops: box.inflight }) });
        j = await readJson(res);
      } catch {
        res = null;
      }
      // worth trying again: no answer, a server failure, a write that kept losing a race, a request turned away for
      // its rate. Not: a refusal of the change itself (malformed, too large, gone, archived) or a database without
      // the tables.
      const transient = !res || (res.status >= 500 && j.setup !== false) || (res.status === 409 && j.code === 'conflict') || (res.status === 429 && j.code !== 'limit') || res.status === 408;
      if (res && res.ok && j.node) {
        box.inflight = [];
        box.fails = 0;
        const fresh = j.node as NodeRow;
        if (!stale(fresh)) {
          note(fresh);
          confirmed.current.set(id, fresh);
        }
      } else if (transient) {
        // not stored: keep the operations, and try again a little later (a retry is safe: every operation is
        // idempotent, see artifact-ops.ts)
        box.pending = [...box.inflight, ...box.pending];
        box.inflight = [];
        box.fails++;
        markSaving(id, 'retrying');
        if (box.timer) window.clearTimeout(box.timer);
        box.timer = window.setTimeout(() => sendOps.current(id), Math.min(30_000, 1000 * 2 ** Math.min(box.fails, 5)));
        return;
      } else {
        // refused: these operations will never be stored, so they stop being shown
        if (j.setup === false) setSetup(false);
        setNotice(typeof j.error === 'string' ? j.error : 'That change could not be saved.');
        box.inflight = [];
        if (j.code === 'not_found' || j.code === 'archived') box.pending = [];
        await refreshNodes().catch(() => {});
      }
      const done = !box.pending.length && !box.inflight.length;
      const now = shown(id);
      if (done) {
        outbox.current.delete(id);
        const base = confirmed.current.get(id);
        confirmed.current.delete(id);
        if (base) putNode(base);
        markSaving(id, null);
      } else {
        if (now) putNode(now);
        box.first = Date.now();
        scheduleOps(id);
      }
    };
    const prev = queue.current.get(id) ?? Promise.resolve();
    const next = prev.then(run, run);
    queue.current.set(id, next.catch(() => undefined));
  };

  const artifactOps = useCallback(
    (id: string, ops: ArtifactOp[]): boolean => {
      if (!ops.length) return true;
      const node = nodesRef.current.find((n) => n.id === id);
      if (!node || node.type !== 'artifact') return false;
      let box = outbox.current.get(id);
      if (!box) {
        box = { pending: [], inflight: [], timer: null, first: Date.now(), fails: 0 };
        outbox.current.set(id, box);
        confirmed.current.set(id, node);
      }
      // check them here first: what would be refused is never shown
      const trial = applyOps(sanitizeComposition(node.content), ops);
      if (!trial.ok) {
        setNotice(trial.error ?? 'That change cannot be made.');
        if (!box.pending.length && !box.inflight.length) {
          outbox.current.delete(id);
          confirmed.current.delete(id);
        }
        return false;
      }
      if (!box.pending.length) box.first = Date.now();
      box.pending.push(...ops);
      putNode({ ...node, content: trial.comp as unknown as Record<string, unknown> });
      markSaving(id, box.fails ? 'retrying' : 'saving');
      scheduleOps(id);
      return true;
    },
    [putNode, markSaving, scheduleOps]
  );

  // leaving the page: what is still waiting is sent now. It also stays waiting, so a page that comes back (the
  // browser's back-forward cache) sends it again; every operation is idempotent, so a second delivery changes nothing.
  useEffect(() => {
    const flush = () => {
      for (const [id, box] of outbox.current) {
        if (!box.pending.length) continue;
        const body = JSON.stringify({ ops: coalesce(box.pending) });
        // a request kept alive past the page may carry 64 KB at most
        if (body.length > 60_000) continue;
        try {
          void fetch(`/api/new-logos/nodes/${encodeURIComponent(id)}/ops`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true });
        } catch {
          /* the page is going; nothing more can be done */
        }
      }
    };
    const back = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      for (const id of outbox.current.keys()) scheduleOps(id);
    };
    window.addEventListener('pagehide', flush);
    window.addEventListener('pageshow', back);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('pageshow', back);
    };
  }, [scheduleOps]);

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
      artifactOps,
      artifactSaving,
      hold,
      putLocal,
    }),
    [loaded, setup, nodes, relations, conversations, conversationsLoaded, loadError, notice, say, refresh, createNode, nodeAction, deleteNode, link, unlink, versions, appendTurns, rename, artifactOps, artifactSaving, hold, putLocal]
  );

  return <NLContext.Provider value={value}>{children}</NLContext.Provider>;
}
