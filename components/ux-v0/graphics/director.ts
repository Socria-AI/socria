'use client';
// components/ux-v0/graphics/director.ts — the creative director, as this browser reaches it.
//
// The orchestration is lib/ux-v0/graphics/director/flow.ts (understand, decide, execute, evaluate: the same code the
// benchmark runs). This file is only how the browser carries it: the three asks go to SocriaUX's routes (the answer
// held to its shape again on arrival), type is measured with the faces a result really uses (loaded first, then the
// composition run again on their real widths), and the picture shown to the director is this browser's own render of
// the artboard, as exported. When a route cannot answer — signed out, not configured, busy, over a budget, offline —
// the director is left alone for a while and the caller is told it was unreachable: the caller falls back to
// SocriaUX's own engine and says so. Nothing here decides anything about a design.

import { operationId, post, type ApiResult, type Progress } from '../api';
import { facesUsed, loadFaces } from './faces';
import type { GraphicDoc } from '@/lib/ux-v0/graphics/doc';
import { canvasMeasure, exportBoardImage } from '@/lib/ux-v0/graphics/raster';
import type { Answer, Bench, Transport } from '@/lib/ux-v0/graphics/director/flow';
import { normalizeDesign, normalizeEdit, normalizeReview } from '@/lib/ux-v0/graphics/director/schema';

let quietUntil = 0;
/** Whether the director is worth asking now (it is left alone for a while after it could not be reached). */
export const directorReachable = (now = Date.now()) => now >= quietUntil;

function failed<T>(r: Extract<ApiResult<unknown>, { ok: false }>): Answer<T> {
  if (r.cancelled) return { ok: false, reason: 'cancelled' };
  if (r.status === 422) return { ok: false, reason: 'unreadable', error: r.error };
  // not reachable: left alone for a while (long when it cannot answer at all, short when it is only busy or slow)
  quietUntil = Date.now() + (r.signIn || r.limit || r.status === 500 || r.status === 401 || r.status === 403 ? 30 * 60_000 : 90_000);
  return { ok: false, reason: 'unreachable', error: r.error };
}

export interface TransportOptions {
  projectId?: string;
  signal?: AbortSignal;
  onProgress?: (p: Progress) => void;
}

/** The asks, carried to SocriaUX's routes. */
export function httpTransport(o: TransportOptions = {}): Transport {
  const opts = (kind: string) => ({ signal: o.signal, onProgress: o.onProgress, operationId: operationId(kind), timeoutMs: 66_000 });
  return {
    async design(body) {
      const r = await post<{ design: unknown }>('/api/ux-v0/graphic-design', { ...body, projectId: o.projectId }, opts('design'));
      if (!r.ok) return failed(r);
      const design = normalizeDesign(r.data.design);
      return design ? { ok: true, value: design } : { ok: false, reason: 'unreadable' };
    },
    async edit(body) {
      const r = await post<{ edit: unknown }>('/api/ux-v0/graphic-edit', { ...body, projectId: o.projectId }, opts('edit'));
      if (!r.ok) return failed(r);
      const edit = normalizeEdit(r.data.edit, { ids: new Set(body.sheet.objects.map((x) => x.id)), given: body.words });
      return edit ? { ok: true, value: edit } : { ok: false, reason: 'unreadable' };
    },
    async review(body) {
      const r = await post<{ review: unknown }>('/api/ux-v0/graphic-design', { ...body, mode: 'review', projectId: o.projectId }, opts('review'));
      if (!r.ok) return failed(r);
      const review = normalizeReview(r.data.review, { ids: new Set(body.sheet.objects.map((x) => x.id)) });
      return review ? { ok: true, value: review } : { ok: false, reason: 'unreadable' };
    },
  };
}

const dataUrl = (blob: Blob) =>
  new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(blob);
  });

/** This browser as the director's bench: real type widths, and the artboard drawn as a picture. */
export function browserBench(resolve: (src: string) => Promise<Blob | null>): Bench {
  return {
    measure: canvasMeasure(),
    async settle(fn) {
      let out = fn(canvasMeasure());
      // a face the result uses and this browser had not loaded was measured as a stand-in: fetched, then run again
      const doc = (out as { doc?: GraphicDoc } | null)?.doc;
      if (doc && (await loadFaces(facesUsed(doc)))) out = fn(canvasMeasure());
      return out;
    },
    async picture(doc, boardId) {
      const board = doc.artboards.find((b) => b.id === boardId);
      if (!board || typeof document === 'undefined') return null;
      for (const maxSide of [760, 560]) {
        const r = await exportBoardImage(doc, board, { type: 'image/jpeg', maxSide, measure: canvasMeasure(), resolve });
        const url = await dataUrl(r.blob);
        if (url.length <= 650_000) return url;
      }
      return null;
    },
  };
}
