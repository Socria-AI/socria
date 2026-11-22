'use client';
// lib/ux-v0/dsi/store.ts — the registry's design systems in this browser, and their account copy.
//
// Device-first like projects (lib/ux-v0/store.ts): every system is written here before anything else, in its own
// IndexedDB database (socria-ux-v0-systems) so the projects database needs no upgrade. Where IndexedDB is not available
// a memory store keeps the session working, and says so. A signed-in designer's systems follow them through
// /api/ux-v0/systems: the newer copy wins, and nothing is ever written over a newer one.

import { normalizeRecord, type SystemRecord } from './registry';

const DB_NAME = 'socria-ux-v0-systems';
const VERSION = 1;
let opening: Promise<IDBDatabase | null> | null = null;
const memory = new Map<string, unknown>();

function open(): Promise<IDBDatabase | null> {
  if (opening) return opening;
  opening = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('systems')) db.createObjectStore('systems', { keyPath: 'id' });
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

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const t = db.transaction('systems', mode);
    const req = fn(t.objectStore('systems'));
    t.oncomplete = () => resolve(req ? (req as IDBRequest<T>).result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function systemsPersistent(): Promise<boolean> {
  return !!(await open());
}

export async function listSystems(): Promise<SystemRecord[]> {
  const db = await open();
  const raw = db ? ((await tx<unknown[]>(db, 'readonly', (s) => s.getAll()).catch(() => [])) ?? []) : [...memory.values()];
  return raw
    .map(normalizeRecord)
    .filter((r): r is SystemRecord => !!r)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getSystem(id: string): Promise<SystemRecord | null> {
  const db = await open();
  const raw = db ? await tx<unknown>(db, 'readonly', (s) => s.get(id)).catch(() => null) : memory.get(id);
  return normalizeRecord(raw);
}

export async function putSystem(r: SystemRecord): Promise<{ ok: true } | { ok: false; reason: 'quota' | 'unavailable' }> {
  const db = await open();
  if (!db) {
    memory.set(r.id, r);
    return { ok: false, reason: 'unavailable' };
  }
  try {
    await tx(db, 'readwrite', (s) => s.put(r));
    return { ok: true };
  } catch (e) {
    memory.set(r.id, r);
    return { ok: false, reason: /quota/i.test(String((e as Error)?.name ?? '')) ? 'quota' : 'unavailable' };
  }
}

export async function deleteSystem(id: string): Promise<void> {
  const db = await open();
  if (!db) return void memory.delete(id);
  await tx(db, 'readwrite', (s) => s.delete(id)).catch(() => undefined);
}

// ── the account copy ──

/** This browser's copy sent to the account (when signed in); a newer copy there is never written over. */
export async function pushSystem(r: SystemRecord): Promise<{ ok: boolean; stale?: boolean; error?: string }> {
  try {
    const res = await fetch('/api/ux-v0/systems', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ system: r }) });
    if (res.status === 409) return { ok: false, stale: true };
    if (!res.ok) return { ok: false, error: ((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? 'Not kept in your account.' };
    return { ok: true };
  } catch {
    return { ok: false, error: 'Offline: kept in this browser.' };
  }
}

/** The account's systems brought into this browser where they are newer (or missing here). */
export async function pullSystems(): Promise<{ pulled: number; error?: string }> {
  try {
    const res = await fetch('/api/ux-v0/systems');
    if (!res.ok) return { pulled: 0 };
    const j = (await res.json()) as { systems?: { id: string; updatedAt: number }[] };
    const local = new Map((await listSystems()).map((r) => [r.id, r]));
    let pulled = 0;
    for (const s of j.systems ?? []) {
      const here = local.get(s.id);
      if (here && here.updatedAt >= s.updatedAt) continue;
      const one = await fetch(`/api/ux-v0/systems?id=${encodeURIComponent(s.id)}`);
      if (!one.ok) continue;
      const rec = normalizeRecord(((await one.json()) as { system?: unknown }).system);
      if (rec) {
        await putSystem(rec);
        pulled++;
      }
    }
    return { pulled };
  } catch {
    return { pulled: 0, error: 'Offline: showing this browser’s systems.' };
  }
}

export async function removeFromAccount(id: string): Promise<void> {
  await fetch(`/api/ux-v0/systems?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => undefined);
}
