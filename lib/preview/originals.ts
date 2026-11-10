// lib/preview/originals.ts — the original of an attached file, in the browser: kept, and found again.
//
// BROWSER ONLY (IndexedDB, fetch, crypto.subtle).
//
// When a file is attached its original is kept twice over: here, on this device,
// so it opens at once and offline; and — for a signed-in account — in private
// storage under that account (app/api/files/original), so it opens on their other
// devices too. Opening a file asks this device first, then the account. Nothing
// here is read by Socria to answer: what it reasons with is the reading
// (lib/docs/client.ts), made separately when the file was attached.

import { getOriginal as legacyOriginal } from '@/lib/docs/client';
import { storedTypeFor } from './kinds';

const DB = 'socria-files';
const STORE = 'files';
/** What this device keeps of originals, oldest dropped first. The account keeps them all. */
const MAX_FILES = 80;
const MAX_BYTES = 400 * 1024 * 1024;

export interface KeptFile {
  id: string;
  blob: Blob;
  name: string;
  type: string;
  size: number;
  at: number;
}

/** The first 32 hex characters of the SHA-256 of a file — its id here and in the account's storage. */
export async function fileIdOf(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const t = db.transaction(STORE, mode);
      const r = run(t.objectStore(STORE));
      t.oncomplete = () => resolve(r ? (r.result as T) : null);
      t.onerror = () => resolve(null);
      t.onabort = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function keepHere(f: KeptFile): Promise<void> {
  await tx('readwrite', (s) => s.put(f));
  // the oldest go first once the device holds too many, or too much
  const all = ((await tx<KeptFile[]>('readonly', (s) => s.getAll())) ?? []).sort((a, b) => b.at - a.at);
  let bytes = 0;
  const drop: string[] = [];
  all.forEach((x, k) => {
    bytes += x.size;
    if (k >= MAX_FILES || bytes > MAX_BYTES) drop.push(x.id);
  });
  for (const id of drop) if (id !== f.id) await tx('readwrite', (s) => s.delete(id));
}

/** An original kept on this device. */
export async function fileHere(id: string): Promise<KeptFile | null> {
  const got = await tx<KeptFile>('readonly', (s) => s.get(id));
  return got?.blob ? got : null;
}

export interface KeepOptions {
  /** signed in: the original is kept with the account too */
  account: boolean;
  headers: () => Record<string, string>;
}

/**
 * Keep the original of a file just attached. Returns what the attachment carries
 * (its id, size, type, when). Keeping it here is awaited; keeping it with the
 * account runs on behind, and a failure there leaves the original on this device.
 */
export async function keepOriginal(file: File, o: KeepOptions): Promise<{ file: string; size: number; mime: string; at: number }> {
  const id = await fileIdOf(file);
  const at = Date.now();
  const type = file.type || storedTypeFor(file.name);
  await keepHere({ id, blob: file, name: file.name, type, size: file.size, at });
  if (o.account) void keepWithAccount(id, file, o).catch(() => {});
  return { file: id, size: file.size, mime: type, at };
}

async function keepWithAccount(id: string, file: File, o: KeepOptions): Promise<void> {
  const res = await fetch('/api/files/original', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...o.headers() },
    body: JSON.stringify({ id, name: file.name, size: file.size, type: file.type }),
  });
  const json = (await res.json().catch(() => ({}))) as { url?: string; exists?: boolean };
  if (!res.ok || json.exists || !json.url) return;
  // stored as an ordinary file type, never one a browser would run if it were opened directly
  const body = new FormData();
  body.append('cacheControl', '3600');
  body.append('', new Blob([file], { type: storedTypeFor(file.name, file.type) }), file.name);
  await fetch(json.url, { method: 'PUT', headers: { 'x-upsert': 'false' }, body });
}

export type Found = { blob: Blob; from: 'device' | 'account' } | { blob: null; why: 'not-kept' | 'not-yours' | 'offline' | 'signed-out' };

/**
 * The original of an attachment, wherever it is: this device, then (signed in)
 * the account. `doc` finds an original this device kept before originals had
 * their own ids (PDFs and photos, by their reading's id).
 */
export async function findOriginal(ref: { file?: string; doc?: string }, o: { account: boolean; headers: () => Record<string, string> }): Promise<Found> {
  if (ref.file) {
    const here = await fileHere(ref.file);
    if (here) return { blob: here.blob, from: 'device' };
  }
  if (ref.doc) {
    const old = await legacyOriginal(ref.doc).catch(() => null);
    if (old) return { blob: old, from: 'device' };
  }
  if (!ref.file) return { blob: null, why: 'not-kept' };
  if (!o.account) return { blob: null, why: 'signed-out' };
  let res: Response;
  try {
    res = await fetch(`/api/files/original/${ref.file}`, { headers: o.headers(), cache: 'no-store' });
  } catch {
    return { blob: null, why: 'offline' };
  }
  if (res.status === 404) return { blob: null, why: 'not-yours' };
  if (!res.ok) return { blob: null, why: 'offline' };
  const json = (await res.json().catch(() => ({}))) as { url?: string; type?: string };
  if (!json.url) return { blob: null, why: 'offline' };
  try {
    const got = await fetch(json.url, { cache: 'no-store' });
    if (!got.ok) return { blob: null, why: 'offline' };
    const blob = await got.blob();
    // kept here too, so the next opening is immediate
    void keepHere({ id: ref.file, blob, name: '', type: blob.type, size: blob.size, at: Date.now() });
    return { blob, from: 'account' };
  } catch {
    return { blob: null, why: 'offline' };
  }
}

/** What to say when an original cannot be opened. */
export function whyNot(why: Exclude<Found, { blob: Blob }>['why']): string {
  switch (why) {
    case 'signed-out':
      return 'The original of this file stays on the device it was attached from. Sign in on that device to keep files with your account.';
    case 'not-yours':
      return 'The original of this file is kept by the person who attached it, so it is not on this device. What Socria read from it is below.';
    case 'offline':
      return 'The original could not be fetched just now. Check your connection and try again.';
    default:
      return 'The original of this file was not kept — it was attached before Socria kept originals. What Socria read from it is below.';
  }
}
