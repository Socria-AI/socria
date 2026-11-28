'use client';
// lib/ux-v0/company/store.ts — companies in this browser.
//
// Device-first like projects and design systems: every company is written here, in its own IndexedDB database
// (socria-ux-v0-company), so neither of the other databases needs an upgrade. Where IndexedDB is not available a
// memory store keeps the session working. Which company new work belongs to is remembered in this browser
// (localStorage); a project carries its company's id, so it stays with its company wherever it is opened.
//
// The account copy: a company's record is kept beside the account's design systems (/api/ux-v0/systems, the same
// table and the same rule — the newer copy wins); the files of its library stay in this browser's file store, as a
// project's pictures do.

import { normalizeCompany, type Company } from './schema';

const DB_NAME = 'socria-ux-v0-company';
const CURRENT = 'socria-ux-v0-company-current';
let opening: Promise<IDBDatabase | null> | null = null;
const memory = new Map<string, unknown>();

function open(): Promise<IDBDatabase | null> {
  if (opening) return opening;
  opening = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains('companies')) req.result.createObjectStore('companies', { keyPath: 'id' });
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
    const t = db.transaction('companies', mode);
    const req = fn(t.objectStore('companies'));
    t.oncomplete = () => resolve(req ? (req as IDBRequest<T>).result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function listCompanies(): Promise<Company[]> {
  const db = await open();
  const raw = db ? ((await tx<unknown[]>(db, 'readonly', (s) => s.getAll()).catch(() => [])) ?? []) : [...memory.values()];
  return raw
    .map(normalizeCompany)
    .filter((c): c is Company => !!c)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getCompany(id: string | null | undefined): Promise<Company | null> {
  if (!id) return null;
  const db = await open();
  const raw = db ? await tx<unknown>(db, 'readonly', (s) => s.get(id)).catch(() => null) : memory.get(id);
  return normalizeCompany(raw);
}

export async function putCompany(c: Company): Promise<{ ok: boolean; reason?: 'quota' | 'unavailable' }> {
  const db = await open();
  if (!db) {
    memory.set(c.id, c);
    return { ok: false, reason: 'unavailable' };
  }
  try {
    await tx(db, 'readwrite', (s) => s.put(c));
    return { ok: true };
  } catch (e) {
    memory.set(c.id, c);
    return { ok: false, reason: /quota/i.test(String((e as Error)?.name ?? '')) ? 'quota' : 'unavailable' };
  }
}

export async function deleteCompany(id: string): Promise<void> {
  const db = await open();
  if (currentCompanyId() === id) setCurrentCompany(null);
  if (!db) return void memory.delete(id);
  await tx(db, 'readwrite', (s) => s.delete(id)).catch(() => undefined);
}

/** The company new work belongs to in this browser, or null (work for no company). */
export function currentCompanyId(): string | null {
  try {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(CURRENT) : null;
    return v && /^co_[\w-]{4,64}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

export function setCurrentCompany(id: string | null): void {
  try {
    if (id) localStorage.setItem(CURRENT, id);
    else localStorage.removeItem(CURRENT);
  } catch {
    /* private mode: work is simply for no company until one is chosen again */
  }
}

// ── the account copy (kept beside the account's design systems) ──

export async function pushCompany(c: Company): Promise<{ ok: boolean; stale?: boolean; error?: string }> {
  try {
    const res = await fetch('/api/ux-v0/systems', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ company: c }) });
    if (res.status === 409) return { ok: false, stale: true };
    if (!res.ok) return { ok: false, error: ((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? 'Not kept in your account.' };
    return { ok: true };
  } catch {
    return { ok: false, error: 'Offline: kept in this browser.' };
  }
}

export async function pullCompanies(): Promise<{ pulled: number }> {
  try {
    const res = await fetch('/api/ux-v0/systems?companies=1');
    if (!res.ok) return { pulled: 0 };
    const j = (await res.json()) as { companies?: { id: string; updatedAt: number }[] };
    const local = new Map((await listCompanies()).map((c) => [c.id, c]));
    let pulled = 0;
    for (const s of j.companies ?? []) {
      const here = local.get(s.id);
      if (here && here.updatedAt >= s.updatedAt) continue;
      const one = await fetch(`/api/ux-v0/systems?company=${encodeURIComponent(s.id)}`);
      if (!one.ok) continue;
      const c = normalizeCompany(((await one.json()) as { company?: unknown }).company);
      if (c) {
        await putCompany(c);
        pulled++;
      }
    }
    return { pulled };
  } catch {
    return { pulled: 0 };
  }
}
