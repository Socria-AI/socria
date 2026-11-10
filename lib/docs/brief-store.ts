// lib/docs/brief-store.ts — Socria's readings of documents, kept on this device.
//
// A reading is made once, when the person asks, and kept beside the document
// it reads — on this device, like the document itself (lib/docs/client.ts),
// never on a server. Its own database, so the documents' database is never
// upgraded under a page that has it open. Read back through restoreBrief, so a
// document corrected since keeps only the points that still stand on it. The
// newest few dozen are kept; the oldest go first.
//
// BROWSER ONLY (falls back to memory where there is no IndexedDB).

import type { DocBrief } from './brief';

const DB = 'socria-briefs';
const STORE = 'briefs';
const KEEP = 40;
const memory = new Map<string, DocBrief>();

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'doc' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | null> {
  const db = await open();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const t = db.transaction(STORE, mode);
      const r = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(r ? (r.result as T) : null);
      t.onerror = () => resolve(null);
      t.onabort = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** A kept reading, as it was kept — still to be read back through restoreBrief. */
export async function getBrief(docId: string): Promise<unknown | null> {
  const hit = memory.get(docId);
  if (hit) return hit;
  return run<unknown>('readonly', (s) => s.get(docId));
}

export async function putBrief(brief: DocBrief): Promise<void> {
  memory.set(brief.doc, brief);
  await run('readwrite', (s) => s.put(brief));
  const all = (await run<{ doc: string; at?: number }[]>('readonly', (s) => s.getAll())) ?? [];
  for (const old of all.sort((a, b) => (b.at ?? 0) - (a.at ?? 0)).slice(KEEP)) await run('readwrite', (s) => s.delete(old.doc));
}

export async function dropBrief(docId: string): Promise<void> {
  memory.delete(docId);
  await run('readwrite', (s) => s.delete(docId));
}
