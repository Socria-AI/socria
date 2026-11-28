'use client';
// components/new-logos/sources/state.tsx — the workspace's sources, in the browser.
//
// The library (lib/new-logos/sources.ts) belongs to the account: one record per file, read from /api/new-logos/sources
// with every component's reference to a source and the canvases each source sits on. Bringing a file in reuses what the
// main app already does with files: its ORIGINAL is kept privately (on this device and with the account,
// lib/preview/originals.ts keepOriginal) and it is READ by the existing reader (lib/docs/client.ts readFileAsDoc →
// /api/files/read), and only then is the record made. Nothing here puts a file on a canvas: placing is the person's act.
//
// Also here, because every surface needs them: the FOCUS VIEWER (one at a time, over everything, opened at a passage
// when one is given) and the PLACER, the current canvas's way of putting a source down where it can be seen — so the
// library can offer "Place on canvas" on touch screens, where dragging is not available.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { SourceDoc } from '@/lib/docs/types';
import { conversationDocs, type ConversationDoc, type SourceMeta, type SourceRefRow } from '@/lib/new-logos/sources';
import { useNL } from '../state';

type Json = Record<string, unknown>;

export interface ViewerTarget {
  sourceId: string;
  /** a passage to open at ("p3.12") */
  passage?: string | null;
}

interface SourcesCtx {
  loaded: boolean;
  /** false: the source tables are not in the database yet */
  setup: boolean | null;
  sources: SourceMeta[];
  refs: SourceRefRow[];
  placements: Record<string, string[]>;
  /** documents already in conversations that the library does not hold yet */
  pending: ConversationDoc[];
  uploading: { name: string; note?: string }[];
  /** changes whenever a reading arrives (so what shows one re-renders) */
  readingsSeen: number;
  refresh: () => Promise<void>;
  /** bring files in: kept, read, recorded. Resolves with the records made (or found). */
  upload: (files: File[], opts?: { conversationId?: string }) => Promise<SourceMeta[]>;
  /** a document already in a conversation, made a library source (its conversations kept) */
  adopt: (doc: ConversationDoc) => Promise<SourceMeta | null>;
  rename: (id: string, name: string) => Promise<boolean>;
  /** delete the source for good (the caller has asked) */
  remove: (id: string) => Promise<{ ok: boolean; originalReleased?: boolean; error?: string }>;
  addRef: (input: { sourceId: string; nodeId: string; passage?: string | null; quote?: string; note?: string; ground?: string | null; origin?: 'human' | 'ai' }) => Promise<SourceRefRow | null>;
  removeRef: (id: string) => Promise<boolean>;
  /** a source's reading (fetched once, then held) */
  reading: (id: string) => Promise<SourceDoc | null>;
  readingNow: (id: string) => SourceDoc | null | undefined;
  /** what a question draws from sources: their outlines and the passages that bear on it */
  passages: (q: { ids?: string[]; docIds?: string[]; query: string }) => Promise<{ docs: SourceDoc[]; sources: { id: string; doc_id: string; name: string }[] }>;
  viewer: ViewerTarget | null;
  openViewer: (t: ViewerTarget | null) => void;
  /** the current canvas's way of placing a source in view; null when no canvas is open */
  placer: ((sourceId: string) => void) | null;
  setPlacer: (fn: ((sourceId: string) => void) | null) => void;
  /** the library asked to open (by a command: "find the document I uploaded yesterday"), with what to look for */
  libraryAsk: { query?: string; since?: number; nonce: number } | null;
  openLibrary: (ask?: { query?: string; since?: number }) => void;
}

const Ctx = createContext<SourcesCtx | null>(null);
export function useSources(): SourcesCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSources outside SourcesProvider');
  return c;
}

const readJson = async (res: Response): Promise<Json> => {
  try {
    return (await res.json()) as Json;
  } catch {
    return {};
  }
};

/** An error from the reader or the server, as a neutral sentence (it may name the product it came from). */
export const neutral = (e: unknown, fallback: string) => {
  const m = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  return m && !/socria|logos|\bcore\b/i.test(m) ? m : fallback;
};

let planLimit: Promise<number> | null = null;
/** The largest file this account may bring in (the existing plan limits, lib/entitlements.ts). */
async function uploadLimit(): Promise<number> {
  if (!planLimit) {
    planLimit = (async () => {
      const { limitsFor } = await import('@/lib/entitlements');
      try {
        const res = await fetch('/api/logos/plan', { cache: 'no-store' });
        const j = (await res.json().catch(() => ({}))) as { plan?: string };
        return limitsFor(j.plan === 'one' ? 'one' : 'free').uploadBytes;
      } catch {
        return limitsFor('free').uploadBytes;
      }
    })();
  }
  return planLimit;
}

const isImage = (f: File) => f.type.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(f.name);

export function SourcesProvider({ children }: { children: ReactNode }) {
  const { conversations, say } = useNL();
  const [loaded, setLoaded] = useState(false);
  const [setup, setSetup] = useState<boolean | null>(null);
  const [sources, setSources] = useState<SourceMeta[]>([]);
  const [refs, setRefs] = useState<SourceRefRow[]>([]);
  const [placements, setPlacements] = useState<Record<string, string[]>>({});
  const [uploading, setUploading] = useState<{ name: string; note?: string }[]>([]);
  const [viewer, setViewer] = useState<ViewerTarget | null>(null);
  const [libraryAsk, setLibraryAsk] = useState<{ query?: string; since?: number; nonce: number } | null>(null);
  const openLibrary = useCallback((ask?: { query?: string; since?: number }) => setLibraryAsk({ ...(ask ?? {}), nonce: Date.now() }), []);
  const [placer, setPlacerState] = useState<{ fn: ((id: string) => void) | null }>({ fn: null });
  const readings = useRef<Map<string, SourceDoc | null>>(new Map());
  // readings arrive after they are asked for: a change here re-renders whatever is waiting for one
  const [readingsSeen, setTick] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/new-logos/sources', { cache: 'no-store' });
      const j = await readJson(res);
      if (j.setup === false) {
        setSetup(false);
        setSources([]);
        setRefs([]);
        return;
      }
      if (!res.ok) return;
      setSetup(true);
      setSources((j.sources as SourceMeta[]) ?? []);
      setRefs((j.refs as SourceRefRow[]) ?? []);
      setPlacements((j.placements as Record<string, string[]>) ?? {});
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onVisible = () => document.visibilityState === 'visible' && void refresh();
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(() => document.visibilityState === 'visible' && void refresh(), 30_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, [refresh]);

  const record = useCallback(async (body: Json): Promise<SourceMeta | null> => {
    const res = await fetch('/api/new-logos/sources', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await readJson(res);
    if (j.setup === false) {
      setSetup(false);
      say('Sources are not set up on this database yet.');
      return null;
    }
    if (!res.ok || !j.source) {
      say(typeof j.error === 'string' ? j.error : 'That file could not be added.');
      return null;
    }
    const s = j.source as SourceMeta;
    setSources((all) => [s, ...all.filter((x) => x.id !== s.id)]);
    return s;
  }, [say]);

  const upload = useCallback(
    async (files: File[], opts: { conversationId?: string } = {}): Promise<SourceMeta[]> => {
      const out: SourceMeta[] = [];
      const limit = await uploadLimit();
      const { keepOriginal } = await import('@/lib/preview/originals');
      const { readFileAsDoc } = await import('@/lib/docs/client');
      const { readPlain } = await import('@/lib/docs/plain');
      const { sanitizeSourceDoc } = await import('@/lib/docs/sanitize');
      const { DIRECT_UPLOAD_BYTES } = await import('@/lib/entitlements');
      for (const file of files.slice(0, 12)) {
        setUploading((u) => [...u, { name: file.name }]);
        try {
          if (file.size > limit) throw new Error(`${file.name} is too large: ${Math.round(limit / (1024 * 1024))} MB at most.`);
          // the original first: on this device at once, with the account behind it
          const kept = await keepOriginal(file, { account: true, headers: () => ({}) });
          let reading: SourceDoc | null = null;
          if (!isImage(file)) {
            const read = await readFileAsDoc(file, { headers: () => ({}), uploadLimit: limit, directLimit: DIRECT_UPLOAD_BYTES });
            if (read.doc) reading = read.doc;
            // a reading too large to send back comes as its text: kept as a plain reading of the same document
            else if (read.note?.text) reading = sanitizeSourceDoc(readPlain(file.name, read.note.text, { id: kept.file.slice(0, 16) }).doc);
          }
          const s = await record({ name: file.name, fileName: file.name, mime: kept.mime || file.type, size: file.size, fileId: kept.file, reading, conversationIds: opts.conversationId ? [opts.conversationId] : [] });
          if (s) {
            out.push(s);
            if (reading) {
              readings.current.set(s.id, reading);
              setTick((t) => t + 1);
            }
          }
        } catch (e) {
          say(neutral(e, `${file.name} could not be added.`));
        } finally {
          setUploading((u) => {
            const i = u.findIndex((x) => x.name === file.name);
            return i === -1 ? u : [...u.slice(0, i), ...u.slice(i + 1)];
          });
        }
      }
      return out;
    },
    [record, say]
  );

  const adopt = useCallback(
    async (doc: ConversationDoc): Promise<SourceMeta | null> => {
      // the full reading when this device kept it; otherwise the text the conversation kept, read as plain text
      const { loadDocs } = await import('@/lib/docs/client');
      const { readPlain } = await import('@/lib/docs/plain');
      const { sanitizeSourceDoc } = await import('@/lib/docs/sanitize');
      const [full] = await loadDocs([doc.doc_id]).catch(() => [] as SourceDoc[]);
      const reading = full ?? (doc.text.trim() ? sanitizeSourceDoc(readPlain(doc.name, doc.text, { id: doc.doc_id }).doc) : null);
      if (!reading && !doc.file_id) {
        say('There is nothing of this document left to keep.');
        return null;
      }
      return record({ name: doc.name, fileName: doc.name, mime: '', size: 0, fileId: doc.file_id, docId: doc.doc_id, reading, conversationIds: doc.conversation_ids });
    },
    [record, say]
  );

  const rename = useCallback(async (id: string, name: string) => {
    const res = await fetch(`/api/new-logos/sources/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    const j = await readJson(res);
    if (!res.ok || !j.source) {
      say(typeof j.error === 'string' ? j.error : 'Not renamed.');
      return false;
    }
    setSources((all) => all.map((s) => (s.id === id ? (j.source as SourceMeta) : s)));
    return true;
  }, [say]);

  const remove = useCallback(async (id: string) => {
    const res = await fetch(`/api/new-logos/sources/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const j = await readJson(res);
    if (!res.ok) return { ok: false, error: typeof j.error === 'string' ? j.error : 'Not deleted.' };
    setSources((all) => all.filter((s) => s.id !== id));
    setRefs((all) => all.filter((r) => r.source_id !== id));
    readings.current.delete(id);
    return { ok: true, originalReleased: !!(j.deleted as Json | undefined)?.originalReleased };
  }, []);

  const addRef = useCallback(async (input: { sourceId: string; nodeId: string; passage?: string | null; quote?: string; note?: string; ground?: string | null; origin?: 'human' | 'ai' }) => {
    const res = await fetch('/api/new-logos/sources/refs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    const j = await readJson(res);
    if (!res.ok || !j.ref) {
      say(typeof j.error === 'string' ? j.error : 'The reference was not kept.');
      return null;
    }
    const r = j.ref as SourceRefRow;
    setRefs((all) => (all.some((x) => x.id === r.id) ? all : [...all, r]));
    return r;
  }, [say]);

  const removeRef = useCallback(async (id: string) => {
    const res = await fetch(`/api/new-logos/sources/refs/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) {
      say('The reference was not removed.');
      return false;
    }
    setRefs((all) => all.filter((r) => r.id !== id));
    return true;
  }, [say]);

  const reading = useCallback(async (id: string): Promise<SourceDoc | null> => {
    if (readings.current.has(id)) return readings.current.get(id) ?? null;
    const res = await fetch(`/api/new-logos/sources/${encodeURIComponent(id)}`, { cache: 'no-store' });
    const j = await readJson(res);
    const doc = res.ok ? ((j.reading as SourceDoc | null) ?? null) : null;
    readings.current.set(id, doc);
    setTick((t) => t + 1);
    return doc;
  }, []);
  const readingNow = useCallback((id: string) => (readings.current.has(id) ? readings.current.get(id) : undefined), []);

  const passages = useCallback(async (q: { ids?: string[]; docIds?: string[]; query: string }) => {
    try {
      const res = await fetch('/api/new-logos/sources/passages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(q) });
      const j = await readJson(res);
      if (!res.ok) return { docs: [], sources: [] };
      return { docs: (j.docs as SourceDoc[]) ?? [], sources: (j.sources as { id: string; doc_id: string; name: string }[]) ?? [] };
    } catch {
      return { docs: [], sources: [] };
    }
  }, []);

  const pending = useMemo(() => {
    const held = new Set(sources.map((s) => s.doc_id).filter(Boolean));
    return conversationDocs(conversations.values()).filter((d) => !held.has(d.doc_id));
  }, [sources, conversations]);

  const setPlacer = useCallback((fn: ((id: string) => void) | null) => setPlacerState({ fn }), []);

  const value = useMemo<SourcesCtx>(
    () => ({ loaded, setup, sources, refs, placements, pending, uploading, readingsSeen, refresh, upload, adopt, rename, remove, addRef, removeRef, reading, readingNow, passages, viewer, openViewer: setViewer, placer: placer.fn, setPlacer, libraryAsk, openLibrary }),
    [loaded, setup, sources, refs, placements, pending, uploading, readingsSeen, refresh, upload, adopt, rename, remove, addRef, removeRef, reading, readingNow, passages, viewer, placer, setPlacer, libraryAsk, openLibrary]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
