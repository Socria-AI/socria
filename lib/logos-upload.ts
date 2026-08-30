// lib/logos-upload.ts
//
// Browser-side file handling. Never import this from a route — it needs canvas.
//
// Two sizes come out of every image: a wide one that goes to the vision pass
// once, and a small one that is the only part kept afterwards. Full-resolution
// uploads are never stored or re-sent; a session's worth of base64 photos in a
// database row helps nobody.

export const READ_MAX_EDGE = 1400;
export const THUMB_MAX_EDGE = 220;
export const MAX_FILE_BYTES = 12 * 1024 * 1024;

export const ACCEPTED_IMAGE = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
export const ACCEPTED_TEXT = ['text/plain', 'text/markdown', 'text/csv', 'application/json'];

export function isImageFile(f: File): boolean {
  return ACCEPTED_IMAGE.includes(f.type);
}

export function isTextFile(f: File): boolean {
  return ACCEPTED_TEXT.includes(f.type) || /\.(txt|md|markdown|csv|json|log)$/i.test(f.name);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That image could not be opened.'));
    img.src = src;
  });
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('That file could not be read.'));
    r.readAsDataURL(file);
  });
}

function resize(img: HTMLImageElement, maxEdge: number, quality: number): string {
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('That image could not be processed.');
  // Photos of whiteboards are the common case and they have no transparency,
  // so a white ground keeps JPEG from filling alpha with black.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}

export interface PreparedImage {
  /** wide version, sent once to be read, then dropped */
  full: string;
  /** small version, the only part that survives the session */
  thumb: string;
  name: string;
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('That image is too large — 12MB is the limit.');
  }
  const img = await loadImage(await readAsDataURL(file));
  return {
    full: resize(img, READ_MAX_EDGE, 0.82),
    thumb: resize(img, THUMB_MAX_EDGE, 0.62),
    name: file.name || 'image',
  };
}

export async function readTextFile(file: File): Promise<{ text: string; name: string }> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('That file is too large.');
  }
  const text = await file.text();
  return { text: text.replace(/\r\n/g, '\n'), name: file.name || 'note' };
}
