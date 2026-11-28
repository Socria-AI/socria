// components/new-logos/primitives/media-client.ts — putting an image into an artifact, in the browser.
//
// BROWSER ONLY (canvas, fetch). An image is made the size it needs to be (longest side MAX_EDGE, no larger than the
// ceiling: a photograph becomes a WebP or JPEG a few hundred kilobytes in size; a small PNG, GIF or WebP goes as it is,
// so an animation or a diagram's sharp edges survive), then sent under an id chosen here, so the media primitive can
// point at it at once. The server decides from the bytes whether it is an image at all.

import { MAX_EDGE, MAX_MEDIA_BYTES, newMediaId, sniffImage } from '@/lib/write/media';

async function decode(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' } as ImageBitmapOptions);
  } catch {
    return await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => (URL.revokeObjectURL(url), resolve(img));
      img.onerror = () => (URL.revokeObjectURL(url), reject(new Error('That file could not be read as an image.')));
      img.src = url;
    });
  }
}

const toBlob = (c: HTMLCanvasElement, type: string, q?: number) => new Promise<Blob | null>((r) => c.toBlob(r, type, q));

/** The image as it will be kept: the bytes, and its size in pixels. */
export async function prepareImage(file: Blob): Promise<{ blob: Blob; w: number; h: number }> {
  const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  const kind = sniffImage(head);
  const pic = await decode(file);
  const w0 = 'naturalWidth' in pic ? pic.naturalWidth : pic.width;
  const h0 = 'naturalHeight' in pic ? pic.naturalHeight : pic.height;
  if (!w0 || !h0) throw new Error('That file could not be read as an image.');
  // already small enough, in a format kept as it is
  if (kind && Math.max(w0, h0) <= MAX_EDGE && file.size <= 1_500_000) return { blob: file, w: w0, h: h0 };
  const k = Math.min(1, MAX_EDGE / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('This browser cannot prepare the image.');
  ctx.drawImage(pic as CanvasImageSource, 0, 0, w, h);
  let out = await toBlob(c, 'image/webp', 0.86);
  if (!out || out.type !== 'image/webp') out = await toBlob(c, 'image/jpeg', 0.86);
  if (!out) throw new Error('This browser cannot prepare the image.');
  if (out.size > MAX_MEDIA_BYTES) throw new Error('That image is too large, even made smaller.');
  return { blob: out, w, h };
}

/** Send an image to the account's private storage. Resolves with its id, or rejects with a sentence. */
export async function uploadImage(file: Blob): Promise<{ id: string; w: number; h: number }> {
  const { blob, w, h } = await prepareImage(file);
  const id = newMediaId();
  const res = await fetch('/api/new-logos/media', { method: 'POST', headers: { 'x-media-id': id, 'Content-Type': blob.type || 'application/octet-stream' }, body: blob });
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; w?: number; h?: number };
  if (!res.ok || !j.ok) throw new Error(j.error || 'The image could not be kept just now.');
  return { id, w: j.w ?? w, h: j.h ?? h };
}

export const mediaUrl = (id: string) => `/api/new-logos/media/${encodeURIComponent(id)}`;
