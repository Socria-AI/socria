// lib/new-logos/media-store.ts — the pictures in artifacts, as bytes (server only).
//
// A media primitive holds only its picture's id; the bytes are kept once, privately, in the account's own picture
// storage (lib/write/media-store.ts: one folder per account, under a digest of the account, never its id) — the same
// storage the account's deletion empties and its export lists, so nothing here needs its own lifecycle. What this adds
// is the release: when an artifact is deleted for good, the pictures only it showed (in its content or its kept
// versions) are removed, unless another artifact still shows them. Anything uncertain keeps the picture.

import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { ownerPrefix } from '@/lib/upload-paths';
import { MEDIA_ID } from '@/lib/write/media';
import { MEDIA_BUCKET } from '@/lib/write/media-store';
import { nodeMediaIds } from './ops';
import type { NodeRow, VersionRow } from './model';
import type { NodeStore } from './store';

/** The pictures `ids` that none of the remaining nodes (or their versions) shows. */
export async function unheldMedia(store: NodeStore, userId: string, ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const held = new Set<string>();
  for (const n of (await store.nodes(userId)).filter((x) => x.type === 'artifact')) for (const m of nodeMediaIds(n, await store.versions(userId, n.id))) held.add(m);
  return ids.filter((id) => !held.has(id));
}

/** After an artifact is deleted: remove the pictures nothing else shows. Returns how many went; never throws. */
export async function releaseArtifactMedia(store: NodeStore, userId: string, deleted: NodeRow, versions: VersionRow[]): Promise<number> {
  try {
    const free = (await unheldMedia(store, userId, nodeMediaIds(deleted, versions))).filter((id) => MEDIA_ID.test(id));
    if (!free.length) return 0;
    const prefix = ownerPrefix(userId);
    const { error } = await supabaseAdmin().storage.from(MEDIA_BUCKET).remove(free.map((id) => `${prefix}/${id}`));
    if (error) {
      console.error('[new-logos] media release failed', error.message);
      return 0;
    }
    return free.length;
  } catch (e) {
    console.error('[new-logos] media release threw', e);
    return 0;
  }
}
