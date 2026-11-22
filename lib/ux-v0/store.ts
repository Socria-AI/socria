'use client';
// lib/ux-v0/store.ts — SocriaUX v0 projects and their files, in this browser.
//
// Device-first (docs/SOCRIAUX-V0.md, D6): every project and every imported
// file is written here before anything else, so a failed request never costs
// work and the workspace never waits on the network to show it. IndexedDB, not
// localStorage, because an uploaded screenshot or page is far larger than
// localStorage holds. Where IndexedDB is unavailable (some private windows),
// a memory store keeps the session working and the workspace says that
// nothing will be kept.

import { normalizeProject, summarize, type DesignProject, type ProjectSummary } from './types';

const DB_NAME = 'socria-ux-v0';
const VERSION = 1;

export interface ArtifactRecord {
  id: string;
  name: string;
  /** the MIME type */
  type: string;
  data: Blob;
  bytes: number;
  createdAt: number;
}

export type StoreResult = { ok: true } | { ok: false; reason: 'quota' | 'unavailable' };

let opening: Promise<IDBDatabase | null> | null = null;
const memory = { projects: new Map<string, unknown>(), artifacts: new Map<string, ArtifactRecord>() };

function open(): Promise<IDBDatabase | null> {
  if (opening) return opening;
  opening = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('artifacts')) db.createObjectStore('artifacts', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return opening;
}

/** Whether this browser keeps anything at all. */
export async function persistent(): Promise<boolean> {
  return !!(await open());
}

function tx<T>(db: IDBDatabase, store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const req = fn(s);
    t.oncomplete = () => resolve(req ? (req as IDBRequest<T>).result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const isQuota = (e: unknown) => /quota/i.test(String((e as { name?: string })?.name ?? '')) || /quota/i.test(String((e as Error)?.message ?? ''));

export async function listProjects(): Promise<ProjectSummary[]> {
  const db = await open();
  const raw = db ? ((await tx<unknown[]>(db, 'projects', 'readonly', (s) => s.getAll()).catch(() => [])) ?? []) : [...memory.projects.values()];
  return raw
    .map((r) => normalizeProject(r))
    .filter((p): p is DesignProject => !!p)
    .map(summarize)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getProject(id: string): Promise<DesignProject | null> {
  const db = await open();
  const raw = db ? await tx<unknown>(db, 'projects', 'readonly', (s) => s.get(id)).catch(() => null) : memory.projects.get(id);
  return normalizeProject(raw);
}

export async function putProject(p: DesignProject): Promise<StoreResult> {
  const db = await open();
  if (!db) {
    memory.projects.set(p.id, p);
    return { ok: false, reason: 'unavailable' };
  }
  try {
    await tx(db, 'projects', 'readwrite', (s) => s.put(p));
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: isQuota(e) ? 'quota' : 'unavailable' };
  }
}

export async function deleteProject(id: string, artifactId?: string): Promise<void> {
  const db = await open();
  if (!db) {
    memory.projects.delete(id);
    if (artifactId) memory.artifacts.delete(artifactId);
    return;
  }
  await tx(db, 'projects', 'readwrite', (s) => s.delete(id)).catch(() => undefined);
  if (artifactId) await tx(db, 'artifacts', 'readwrite', (s) => s.delete(artifactId)).catch(() => undefined);
}

/** Let go of files: a project's uploaded references when the project goes. */
export async function deleteArtifacts(ids: readonly string[]): Promise<void> {
  if (!ids.length) return;
  const db = await open();
  if (!db) {
    for (const id of ids) memory.artifacts.delete(id);
    return;
  }
  for (const id of ids) await tx(db, 'artifacts', 'readwrite', (s) => s.delete(id)).catch(() => undefined);
}

export async function putArtifact(rec: ArtifactRecord): Promise<StoreResult> {
  const db = await open();
  if (!db) {
    memory.artifacts.set(rec.id, rec);
    return { ok: false, reason: 'unavailable' };
  }
  try {
    await tx(db, 'artifacts', 'readwrite', (s) => s.put(rec));
    return { ok: true };
  } catch (e) {
    memory.artifacts.set(rec.id, rec);
    return { ok: false, reason: isQuota(e) ? 'quota' : 'unavailable' };
  }
}

export async function getArtifact(id: string): Promise<ArtifactRecord | null> {
  const db = await open();
  if (!db) return memory.artifacts.get(id) ?? null;
  const rec = await tx<ArtifactRecord>(db, 'artifacts', 'readonly', (s) => s.get(id)).catch(() => undefined);
  return rec ?? memory.artifacts.get(id) ?? null;
}
