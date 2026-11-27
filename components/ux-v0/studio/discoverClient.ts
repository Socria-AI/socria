'use client';
// components/ux-v0/studio/discoverClient.ts — who decides the next turn of creative discovery: the question model when
// it can be reached, the reader always.
//
// The conversation as it stands (and up to two of the person's pictures, made small, so they are actually looked at)
// goes to /api/ux-v0/studio-questions; its decision — one question, or make it — is held to shape again here. When the
// model cannot be reached (signed out, not configured, busy, over a limit, the connection lost) the reader in
// lib/ux-v0/studio/discover.ts decides instead, and the model is left alone for a while. The person never hears about
// any of this: they see one question, or the work.

import { operationId, post } from '../api';
import { getArtifact } from '@/lib/ux-v0/store';
import type { StudioState } from '@/lib/ux-v0/studio/schema';
import { discoverContextOf, readerDecision } from '@/lib/ux-v0/studio/discover';
import { reviveDecision, type Decision } from '@/lib/ux-v0/studio/discover-model';

let quietUntil = 0;
export const modelWorthAsking = (now = Date.now()) => now >= quietUntil;

/** A picture kept in this browser, made small enough to send (a JPEG of at most 768 px on its longer side). */
async function smallPicture(upload: string): Promise<string | null> {
  try {
    const rec = await getArtifact(upload);
    if (!rec) return null;
    const bmp = await createImageBitmap(rec.data);
    const k = Math.min(1, 768 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * k));
    c.height = Math.max(1, Math.round(bmp.height * k));
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    const url = c.toDataURL('image/jpeg', 0.8);
    return url.length <= 590_000 ? url : null;
  } catch {
    return null;
  }
}

export class TurnCancelled extends Error {}

/** The next turn: the model's decision, or the reader's when the model cannot be reached. */
export async function decideTurn(st: StudioState, o: { systemName?: string; projectId?: string; signal?: AbortSignal } = {}): Promise<Decision> {
  if (modelWorthAsking()) {
    const context = discoverContextOf(st, { ...(o.systemName ? { systemName: o.systemName } : {}) });
    const pics = st.attachments.filter((a) => a.kind === 'image' && a.upload).slice(-2);
    const images = (await Promise.all(pics.map((a) => smallPicture(a.upload!)))).filter((x): x is string => !!x);
    const r = await post<{ decision?: unknown }>('/api/ux-v0/studio-questions', { context, images, projectId: o.projectId }, { signal: o.signal, operationId: operationId('question'), timeoutMs: 30_000 });
    if (r.ok) {
      const d = reviveDecision(r.data?.decision, context);
      if (d) return d;
    } else if (r.cancelled) {
      throw new TurnCancelled();
    } else {
      // not reachable: the reader decides; the model is left alone for a while (long when it cannot answer at all)
      quietUntil = Date.now() + (r.signIn || r.limit || r.status === 401 || r.status === 403 || r.status === 500 ? 30 * 60_000 : 2 * 60_000);
    }
  }
  return readerDecision(st);
}
