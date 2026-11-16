'use client';
// components/ux-v0/files.ts — what may be imported, checked by name and by content.
//
// HTML, PNG, JPG and SVG only, within their size limits, and each must be what
// it says: a PNG starts with the PNG signature, a JPEG with its marker, an SVG
// contains an <svg> element, an HTML file is text. A file that is empty, too
// large, or not what its name claims is refused with a reason, before
// anything is saved.

import { LIMITS, type ArtifactKind } from '@/lib/ux-v0/types';

export type Checked = { ok: true; kind: ArtifactKind; type: string } | { ok: false; error: string };

// one decimal below 10 MB, so a file just over a limit never reads as equal to it ("2.1 MB", not "2 MB")
const mb = (n: number) => {
  const v = n / 1_000_000;
  return `${v < 10 ? Math.ceil(v * 10) / 10 : Math.ceil(v)} MB`;
};

export async function checkFile(file: File): Promise<Checked> {
  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  const kind: ArtifactKind | null = ext === 'html' || ext === 'htm' ? 'html' : ext === 'png' ? 'png' : ext === 'jpg' || ext === 'jpeg' ? 'jpg' : ext === 'svg' ? 'svg' : null;
  if (!kind) return { ok: false, error: 'SocriaUX imports HTML, PNG, JPG and SVG files.' };
  if (!file.size) return { ok: false, error: 'That file is empty.' };
  const limit = kind === 'html' ? LIMITS.htmlBytes : kind === 'svg' ? LIMITS.svgBytes : LIMITS.imageBytes;
  if (file.size > limit) return { ok: false, error: `That file is ${mb(file.size)}; the limit for ${kind.toUpperCase()} is ${mb(limit)}.` };
  const head = new Uint8Array(await file.slice(0, 2048).arrayBuffer());
  if (kind === 'png') {
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (!sig.every((b, i) => head[i] === b)) return { ok: false, error: 'That file is named .png but is not a PNG image.' };
    return { ok: true, kind, type: 'image/png' };
  }
  if (kind === 'jpg') {
    if (!(head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff)) return { ok: false, error: 'That file is named .jpg but is not a JPEG image.' };
    return { ok: true, kind, type: 'image/jpeg' };
  }
  if (head.includes(0)) return { ok: false, error: `That file is not text, so it cannot be ${kind === 'svg' ? 'an SVG' : 'HTML'}.` };
  const text = new TextDecoder().decode(head).toLowerCase();
  if (kind === 'svg') {
    if (!text.includes('<svg')) return { ok: false, error: 'That file is named .svg but contains no <svg> element.' };
    return { ok: true, kind, type: 'image/svg+xml' };
  }
  if (!/<[a-z!]/.test(text)) return { ok: false, error: 'That file does not look like HTML.' };
  return { ok: true, kind, type: 'text/html' };
}

/** An image's natural size, from its bytes. */
export function imageSize(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const im = new Image();
    im.onload = () => {
      const r = { width: im.naturalWidth || 1200, height: im.naturalHeight || 800 };
      URL.revokeObjectURL(url);
      resolve(r);
    };
    im.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('The image could not be read.'));
    };
    im.src = url;
  });
}

/** Keep the original with the account (the private files bucket), when signed in. Best effort. */
export async function keepOriginal(id: string, file: Blob, name: string, type: string): Promise<'account' | 'failed'> {
  try {
    const res = await fetch('/api/files/original', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, name, size: file.size, type }) });
    const j = await res.json().catch(() => null);
    if (res.ok && j?.exists) return 'account';
    if (!res.ok || typeof j?.url !== 'string') return 'failed';
    const put = await fetch(j.url, { method: 'PUT', headers: { 'Content-Type': type }, body: file });
    return put.ok ? 'account' : 'failed';
  } catch {
    return 'failed';
  }
}

/** Fetch an original kept with the account. */
export async function fetchOriginal(id: string): Promise<Blob | null> {
  try {
    const res = await fetch(`/api/files/original/${id}`);
    const j = res.ok ? await res.json() : null;
    if (!j?.url) return null;
    const file = await fetch(j.url);
    return file.ok ? await file.blob() : null;
  } catch {
    return null;
  }
}
