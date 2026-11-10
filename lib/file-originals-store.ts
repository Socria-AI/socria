// lib/file-originals-store.ts — where a signed-in person's attached originals are kept.
//
// One private bucket (lib/file-originals.ts FILES_BUCKET), made on first use with the
// largest plan's file ceiling as its own, so a signed upload can never carry more than
// any plan allows; the caller's own plan is checked before an upload is signed and
// again whenever the original is read. Everything of one person's is in one folder:
// listed whole for an export, removed whole with the account. A conversation's
// originals go with it when it is deleted, unless another of their conversations
// still holds one.

import 'server-only';
import { supabaseAdmin } from './supabase';
import { limitsFor } from './entitlements';
import { ownerPrefix } from './upload-paths';
import { FILES_BUCKET, FILE_ID, ORIGINAL_LINK_SECONDS, originalPath } from './file-originals';

let ready: Promise<void> | null = null;

export function ensureFilesBucket(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const storage = supabaseAdmin().storage;
      const got = await storage.getBucket(FILES_BUCKET);
      if (got.data) return;
      const made = await storage.createBucket(FILES_BUCKET, { public: false, fileSizeLimit: limitsFor('one').uploadBytes });
      if (made.error && !/already exists/i.test(made.error.message)) throw made.error;
    })().catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}

export interface OriginalInfo {
  size: number;
  type: string;
}

/** An original of this person's, if it is kept: its size and type. */
export async function originalInfo(userId: string, id: string): Promise<OriginalInfo | null> {
  if (!FILE_ID.test(id)) return null;
  await ensureFilesBucket();
  const { data, error } = await supabaseAdmin().storage.from(FILES_BUCKET).list(ownerPrefix(userId), { search: id, limit: 2 });
  if (error) throw error;
  const hit = (data ?? []).find((f) => f.name === id);
  if (!hit) return null;
  const meta = (hit.metadata ?? {}) as { size?: number; mimetype?: string };
  return { size: Number(meta.size) || 0, type: meta.mimetype || 'application/octet-stream' };
}

/** A one-time link the browser uploads an original to; `exists` when it is already kept. */
export async function signOriginalUpload(userId: string, id: string): Promise<{ url: string; token?: string } | { exists: true } | { error: string }> {
  const path = originalPath(userId, id);
  if (!path) return { error: 'bad id' };
  if (await originalInfo(userId, id)) return { exists: true };
  const { data, error } = await supabaseAdmin().storage.from(FILES_BUCKET).createSignedUploadUrl(path, { upsert: false });
  if (error || !data) {
    if (error && /already exists|duplicate/i.test(error.message)) return { exists: true };
    return { error: error?.message ?? 'no upload could be prepared' };
  }
  return { url: data.signedUrl, ...(data.token ? { token: data.token } : {}) };
}

/** A short link to read an original of this person's. */
export async function originalLink(userId: string, id: string, seconds = ORIGINAL_LINK_SECONDS): Promise<string | null> {
  const path = originalPath(userId, id);
  if (!path) return null;
  const { data, error } = await supabaseAdmin().storage.from(FILES_BUCKET).createSignedUrl(path, seconds);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function removeOriginals(userId: string, ids: string[]): Promise<number> {
  const paths = ids.map((id) => originalPath(userId, id)).filter((p): p is string => !!p);
  if (!paths.length) return 0;
  await ensureFilesBucket();
  const { data, error } = await supabaseAdmin().storage.from(FILES_BUCKET).remove(paths);
  if (error) throw error;
  return data?.length ?? 0;
}

async function listAll(prefix: string): Promise<{ name: string; size: number; type: string; at: string | null }[]> {
  const out: { name: string; size: number; type: string; at: string | null }[] = [];
  const storage = supabaseAdmin().storage.from(FILES_BUCKET);
  for (let offset = 0; offset < 100_000; offset += 1000) {
    const { data, error } = await storage.list(prefix, { limit: 1000, offset });
    if (error || !data?.length) break;
    for (const f of data) {
      const meta = (f.metadata ?? {}) as { size?: number; mimetype?: string };
      out.push({ name: f.name, size: Number(meta.size) || 0, type: meta.mimetype ?? '', at: f.created_at ?? null });
    }
    if (data.length < 1000) break;
  }
  return out.filter((f) => FILE_ID.test(f.name));
}

/** Every original of one person — for an export, each with a link that works for an hour. */
export async function listOriginals(userId: string): Promise<{ id: string; type: string; bytes: number; createdAt: string | null; download: string | null }[]> {
  await ensureFilesBucket();
  const prefix = ownerPrefix(userId);
  const files = await listAll(prefix);
  const storage = supabaseAdmin().storage.from(FILES_BUCKET);
  const signed = files.length ? await storage.createSignedUrls(files.map((f) => `${prefix}/${f.name}`), 3600) : { data: [] as { signedUrl: string | null }[] };
  return files.map((f, k) => ({ id: f.name, type: f.type, bytes: f.size, createdAt: f.at, download: signed.data?.[k]?.signedUrl ?? null }));
}

/** Every original of one person removed — on account deletion. Returns how many went. */
export async function purgeOriginals(userId: string): Promise<number> {
  try {
    await ensureFilesBucket();
    const prefix = ownerPrefix(userId);
    const files = await listAll(prefix);
    const storage = supabaseAdmin().storage.from(FILES_BUCKET);
    let removed = 0;
    for (let k = 0; k < files.length; k += 500) {
      const paths = files.slice(k, k + 500).map((f) => `${prefix}/${f.name}`);
      const { error } = await storage.remove(paths);
      if (!error) removed += paths.length;
    }
    return removed;
  } catch (e) {
    console.error('[socria/files] purge failed', e);
    return 0;
  }
}

/**
 * The originals a deleted conversation held, removed — unless another of their
 * conversations still holds one (the same file attached twice is kept once). Called
 * after the row is gone. Anything uncertain keeps the file: a failed check is a file
 * kept until the account goes, never one lost from a conversation still using it.
 */
export async function releaseOriginals(userId: string, ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  try {
    const db = supabaseAdmin();
    const free: string[] = [];
    for (const id of ids.slice(0, 200)) {
      const { data, error } = await db.from('conversations').select('id').eq('user_id', userId).contains('messages', [{ attachments: [{ file: id }] }]).limit(1);
      if (error) {
        console.error('[socria/files] release check failed', error.message);
        return 0;
      }
      if (!data?.length) free.push(id);
    }
    return free.length ? await removeOriginals(userId, free) : 0;
  } catch (e) {
    console.error('[socria/files] release threw', e);
    return 0;
  }
}
