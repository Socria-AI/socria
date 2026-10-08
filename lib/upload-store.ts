// lib/upload-store.ts
//
// THE PRIVATE BUCKET LARGE UPLOADS PASS THROUGH (Socria One). The bucket is
// made on first use, private, with the plan's size limit as its own ceiling,
// so a signed upload cannot carry more than the plan allows even if a client
// tries. Files are removed when read; `sweepStaleUploads` removes any that
// were uploaded and never read; `purgeUploads` removes a person's on account
// deletion.

import 'server-only';
import { supabaseAdmin } from './supabase';
import { limitsFor } from './entitlements';
import { UPLOAD_BUCKET, UPLOAD_TTL_MS, ownerPrefix, uploadMadeAt } from './upload-paths';

let ready: Promise<void> | null = null;

export function ensureUploadBucket(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const storage = supabaseAdmin().storage;
      const got = await storage.getBucket(UPLOAD_BUCKET);
      if (got.data) return;
      const made = await storage.createBucket(UPLOAD_BUCKET, { public: false, fileSizeLimit: limitsFor('one').uploadBytes });
      if (made.error && !/already exists/i.test(made.error.message)) throw made.error;
    })().catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}

export async function signedUploadFor(path: string): Promise<{ url: string } | { error: string }> {
  await ensureUploadBucket();
  const { data, error } = await supabaseAdmin().storage.from(UPLOAD_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { error: error?.message ?? 'no upload could be prepared' };
  return { url: data.signedUrl };
}

export async function readUpload(path: string): Promise<Buffer | null> {
  const { data, error } = await supabaseAdmin().storage.from(UPLOAD_BUCKET).download(path);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

export async function removeUpload(path: string): Promise<void> {
  await supabaseAdmin().storage.from(UPLOAD_BUCKET).remove([path]).catch(() => null);
}

async function removeFolderTree(prefix: string, olderThan?: number): Promise<number> {
  const storage = supabaseAdmin().storage.from(UPLOAD_BUCKET);
  const { data: folders } = await storage.list(prefix, { limit: 1000 });
  let removed = 0;
  for (const f of folders ?? []) {
    const made = uploadMadeAt(f.name);
    if (made === null || (olderThan !== undefined && made > olderThan)) continue;
    const { data: files } = await storage.list(`${prefix}/${f.name}`, { limit: 100 });
    const paths = (files ?? []).map((x) => `${prefix}/${f.name}/${x.name}`);
    if (paths.length) {
      await storage.remove(paths).catch(() => null);
      removed += paths.length;
    }
  }
  return removed;
}

/** Remove uploads that were never read (older than the TTL). Returns how many files went. */
export async function sweepStaleUploads(now = Date.now()): Promise<number> {
  await ensureUploadBucket();
  const { data: owners } = await supabaseAdmin().storage.from(UPLOAD_BUCKET).list('', { limit: 1000 });
  let removed = 0;
  for (const o of owners ?? []) if (/^[a-f0-9]{24}$/.test(o.name)) removed += await removeFolderTree(o.name, now - UPLOAD_TTL_MS);
  return removed;
}

/** Remove every upload of one person — on account deletion. */
export async function purgeUploads(userId: string): Promise<number> {
  try {
    await ensureUploadBucket();
    return await removeFolderTree(ownerPrefix(userId));
  } catch {
    return 0;
  }
}
