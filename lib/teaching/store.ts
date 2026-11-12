// lib/teaching/store.ts — WHERE COURSE PROFILES ARE KEPT: IN THIS BROWSER, BESIDE THE MATERIALS THEY CAME FROM.
//
// The materials a profile is built from are kept in this browser (lib/docs/client.ts, IndexedDB "socria-docs");
// the server never keeps a reading of a document. A profile holds short passages of those materials as its
// evidence, so it is kept the same way: IndexedDB "socria-courses", one record a course. What travels with a turn
// is the small pack (lib/teaching/use.ts packOf), behind the same gate as the learning ledger.
//
// Which course a conversation is in, when the person chose (or turned courses off for it), is a small map from
// conversation to profile in localStorage. "Clear memory", signing out and deleting the account clear both
// (lib/local-data.ts).
//
// Browser only; every function is safe to call where there is no browser (it does nothing).

import { sanitizeProfile, sanitizeProfiles, MAX_PROFILES } from './profile';
import type { CourseProfile } from './types';

const DB = 'socria-courses';
export const COURSE_LINKS_KEY = 'socria.course.links.v1';
const listeners = new Set<(all: CourseProfile[]) => void>();
let cache: CourseProfile[] | null = null;

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('profiles')) db.createObjectStore('profiles', { keyPath: 'id' });
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
      const t = db.transaction('profiles', mode);
      const r = run(t.objectStore('profiles'));
      t.oncomplete = () => {
        resolve(r ? (r.result as T) : null);
        db.close();
      };
      t.onerror = () => resolve(null);
      t.onabort = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

const tell = () => {
  const all = cache ?? [];
  for (const l of listeners) l(all);
};

/** Every profile kept in this browser, newest first. */
export async function listProfiles(): Promise<CourseProfile[]> {
  if (cache) return cache;
  const raw = (await tx<unknown[]>('readonly', (s) => s.getAll())) ?? [];
  cache = sanitizeProfiles(raw).sort((a, b) => b.updatedAt - a.updatedAt);
  return cache;
}

/** A profile kept (replacing itself, or the record it had under a key it no longer has). */
export async function putProfile(p: CourseProfile, was?: string): Promise<CourseProfile | null> {
  const clean = sanitizeProfile(JSON.parse(JSON.stringify(p)));
  if (!clean) return null;
  const all = await listProfiles();
  cache = [clean, ...all.filter((x) => x.id !== clean.id && x.id !== was)].slice(0, MAX_PROFILES);
  tell();
  if (was && was !== clean.id) {
    await tx('readwrite', (s) => s.delete(was));
    relink(was, clean.id);
  }
  await tx('readwrite', (s) => s.put(clean));
  return clean;
}

export async function dropProfile(id: string): Promise<void> {
  const all = await listProfiles();
  cache = all.filter((x) => x.id !== id);
  tell();
  relink(id, null);
  await tx('readwrite', (s) => s.delete(id));
}

/** Everything gone: profiles and which conversation was in which course ("Clear memory", signing out). */
export function clearCourses(): void {
  cache = [];
  tell();
  try {
    if (typeof indexedDB !== 'undefined') indexedDB.deleteDatabase(DB);
  } catch {
    /* nothing to do */
  }
  try {
    if (typeof window !== 'undefined') window.localStorage.removeItem(COURSE_LINKS_KEY);
  } catch {
    /* nothing to do */
  }
}

/** Be told when profiles change, in this tab. */
export function onProfiles(fn: (all: CourseProfile[]) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ── which conversation is in which course ────────────────────────────

/** The person's choice per conversation: a profile's key, or 'off'. */
export function readLinks(): Record<string, string> {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(COURSE_LINKS_KEY) : null;
    const v = raw ? (JSON.parse(raw) as unknown) : {};
    if (!v || typeof v !== 'object') return {};
    const out: Record<string, string> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>).slice(-400)) {
      if (/^[\w\-:.]{1,80}$/.test(k) && typeof x === 'string' && /^(off|[a-z0-9\-~]{1,90})$/.test(x)) out[k] = x;
    }
    return out;
  } catch {
    return {};
  }
}

export function setLink(conversation: string, to: string | null): void {
  try {
    const links = readLinks();
    if (to) links[conversation] = to;
    else delete links[conversation];
    window.localStorage.setItem(COURSE_LINKS_KEY, JSON.stringify(links));
  } catch {
    /* nothing to do */
  }
}

function relink(from: string, to: string | null): void {
  try {
    const links = readLinks();
    let changed = false;
    for (const [k, v] of Object.entries(links)) {
      if (v !== from) continue;
      changed = true;
      if (to) links[k] = to;
      else delete links[k];
    }
    if (changed) window.localStorage.setItem(COURSE_LINKS_KEY, JSON.stringify(links));
  } catch {
    /* nothing to do */
  }
}
