// lib/write/media-store.ts — where a signed-in person's pictures are kept.
//
// One private bucket. A picture is at `<owner>/<id>`, the owner being the
// digest of the account the upload paths already use (lib/upload-paths.ts),
// so an account's id is never in a path and everything of one person's is in
// one folder: removed whole when the account is deleted, listed whole for an
// export; a conversation's pictures go with it when it is deleted, unless
// other writing of theirs still holds them. The bucket is made on first use,
// private, with a picture's ceiling as its own and only picture formats
// allowed, so a signed upload or a bug here cannot put anything else in it.

import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { ownerPrefix } from '@/lib/upload-paths';
import { draftMediaIds, MAX_MEDIA_BYTES, MEDIA_ID, MEDIA_OWNER, MEDIA_TYPES, type MediaType } from './media';

export const MEDIA_BUCKET = 'socria-write-media';
/** The most pictures one conversation's deletion looks for in the other drafts. */
const MAX_RELEASE = 400;

let ready: Promise<void> | null = null;

export function ensureMediaBucket(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const storage = supabaseAdmin().storage;
      const got = await storage.getBucket(MEDIA_BUCKET);
      if (got.data) return;
      const made = await storage.createBucket(MEDIA_BUCKET, { public: false, fileSizeLimit: MAX_MEDIA_BYTES, allowedMimeTypes: [...MEDIA_TYPES] });
      if (made.error && !/already exists/i.test(made.error.message)) throw made.error;
    })().catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}

/** One picture kept under this person. A picture already there (the same id, sent twice) is kept, not refused. */
export async function putMedia(userId: string, id: string, bytes: Uint8Array, type: MediaType): Promise<{ ok: true; by: string } | { ok: false; error: string }> {
  if (!MEDIA_ID.test(id)) return { ok: false, error: 'bad id' };
  await ensureMediaBucket();
  const by = ownerPrefix(userId);
  const { error } = await supabaseAdmin().storage.from(MEDIA_BUCKET).upload(`${by}/${id}`, bytes, { contentType: type, upsert: false, cacheControl: '31536000' });
  if (error && !/already exists|duplicate/i.test(error.message)) return { ok: false, error: error.message };
  return { ok: true, by };
}

/** A picture's bytes, from the folder of whoever kept it. */
export async function getMedia(owner: string, id: string): Promise<{ bytes: Uint8Array; type: string } | null> {
  if (!MEDIA_ID.test(id) || !MEDIA_OWNER.test(owner)) return null;
  const { data, error } = await supabaseAdmin().storage.from(MEDIA_BUCKET).download(`${owner}/${id}`);
  if (error || !data) return null;
  return { bytes: new Uint8Array(await data.arrayBuffer()), type: data.type || 'application/octet-stream' };
}

async function listAll(prefix: string): Promise<{ name: string; size: number; type: string; at: string | null }[]> {
  const out: { name: string; size: number; type: string; at: string | null }[] = [];
  const storage = supabaseAdmin().storage.from(MEDIA_BUCKET);
  for (let offset = 0; offset < 100_000; offset += 1000) {
    const { data, error } = await storage.list(prefix, { limit: 1000, offset });
    if (error || !data?.length) break;
    for (const f of data) {
      const meta = (f.metadata ?? {}) as { size?: number; mimetype?: string };
      out.push({ name: f.name, size: Number(meta.size) || 0, type: meta.mimetype ?? '', at: f.created_at ?? null });
    }
    if (data.length < 1000) break;
  }
  return out;
}

/** Every picture of one person — for an export, with a link to each that works for an hour. */
export async function listMedia(userId: string): Promise<{ id: string; type: string; bytes: number; createdAt: string | null; download: string | null }[]> {
  await ensureMediaBucket();
  const prefix = ownerPrefix(userId);
  const files = (await listAll(prefix)).filter((f) => MEDIA_ID.test(f.name));
  const storage = supabaseAdmin().storage.from(MEDIA_BUCKET);
  const signed = files.length ? await storage.createSignedUrls(files.map((f) => `${prefix}/${f.name}`), 3600) : { data: [] as { signedUrl: string | null }[] };
  return files.map((f, k) => ({ id: f.name, type: f.type, bytes: f.size, createdAt: f.at, download: signed.data?.[k]?.signedUrl ?? null }));
}

/**
 * A conversation deleted: the pictures its writing held go with it — those in
 * this person's folder that none of their other writing still holds (a
 * picture copied into another draft stays for that one). Called after the row
 * is gone, so it is not counted. Each picture is looked for in the other
 * drafts by the database itself (`draft->>doc` is the document as text), so
 * nobody's drafts are read here. Anything uncertain keeps the picture: a
 * failed check is a picture kept, never one lost. Returns how many went.
 */
export async function releaseDraftMedia(userId: string, draft: unknown): Promise<number> {
  const all = draftMediaIds(draft);
  if (!all.length) return 0;
  // a few at a time, and no more than a deletion should wait for: the rest
  // stay, and go with the account
  const ids = all.slice(0, MAX_RELEASE);
  if (all.length > ids.length) console.error(`[socria/write-media] release: ${all.length - ids.length} pictures left for the account deletion`);
  try {
    const db = supabaseAdmin();
    const free: string[] = [];
    for (let k = 0; k < ids.length; k += 8) {
      const batch = ids.slice(k, k + 8);
      const held = await Promise.all(batch.map((id) => db.from('conversations').select('id').eq('user_id', userId).like('draft->>doc', `%m:${id}%`).limit(1)));
      for (let j = 0; j < batch.length; j++) {
        const { data, error } = held[j];
        if (error) {
          console.error('[socria/write-media] release check failed', error.message);
          return 0;
        }
        if (!data?.length) free.push(batch[j]);
      }
    }
    if (!free.length) return 0;
    const prefix = ownerPrefix(userId);
    const { error } = await db.storage.from(MEDIA_BUCKET).remove(free.map((id) => `${prefix}/${id}`));
    if (error) {
      console.error('[socria/write-media] release failed', error.message);
      return 0;
    }
    return free.length;
  } catch (e) {
    console.error('[socria/write-media] release threw', e);
    return 0;
  }
}

/** Every picture of one person removed — on account deletion. Returns how many went. */
export async function purgeMedia(userId: string): Promise<number> {
  try {
    await ensureMediaBucket();
    const prefix = ownerPrefix(userId);
    const files = await listAll(prefix);
    const storage = supabaseAdmin().storage.from(MEDIA_BUCKET);
    let removed = 0;
    for (let k = 0; k < files.length; k += 500) {
      const paths = files.slice(k, k + 500).map((f) => `${prefix}/${f.name}`);
      const { error } = await storage.remove(paths);
      if (!error) removed += paths.length;
    }
    return removed;
  } catch (e) {
    console.error('[socria/write-media] purge failed', e);
    return 0;
  }
}
