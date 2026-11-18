'use client';
// components/ux-v0/uploads.ts — the designer's own references: kept in this browser, read for colour.
//
// An upload is a picture (PNG, JPG, WebP, an animated GIF) or a short clip
// (MP4, WebM) that says something the libraries cannot: a spread whose
// typography they love, a still from a film for its light, a clip for its
// pacing. Pictures are scaled to at most 1600 px and kept in the browser's file
// store (the same one imported designs use); colours are sampled from them. A
// reference's address is made when it is shown: an object URL for the
// workspace, a data URL for the sealed frames (which may load nothing else
// from this origin). Nothing leaves the browser: uploads are not sent to the
// account or to any model.

import { useEffect, useMemo, useState } from 'react';
import { getArtifact, putArtifact } from '@/lib/ux-v0/store';
import { fileId, normalizeRef, type MoodboardRef } from '@/lib/ux-v0/types';

const IMAGE = /^image\/(png|jpeg|webp|gif)$/;
const VIDEO = /^video\/(mp4|webm)$/;
const MAX_IMAGE = 15_000_000;
const MAX_GIF = 8_000_000;
const MAX_VIDEO = 20_000_000;

const objectUrls = new Map<string, string>();
const dataUrls = new Map<string, string>();
const media = new Map<string, Blob>();

async function blobOf(id: string): Promise<Blob | null> {
  if (media.has(id)) return media.get(id)!;
  const rec = await getArtifact(id).catch(() => null);
  if (!rec) return null;
  media.set(id, rec.data);
  return rec.data;
}

const readAsDataUrl = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });

/** Load the files behind a board's uploads (once each), so their addresses can be made. */
export async function preloadUploads(refs: readonly MoodboardRef[], forFrames = false): Promise<void> {
  const ids = refs.filter((r) => r.provider === 'upload').map((r) => r.providerId);
  await Promise.all(
    ids.map(async (id) => {
      const b = await blobOf(id);
      if (!b) return;
      if (!objectUrls.has(id)) objectUrls.set(id, URL.createObjectURL(b));
      if (forFrames && !dataUrls.has(id) && b.type.startsWith('image/')) dataUrls.set(id, await readAsDataUrl(b).catch(() => ''));
    })
  );
}

/** The refs with their uploads' addresses filled in: object URLs for the workspace, data URLs for frames. */
export function withUploads(refs: readonly MoodboardRef[], forFrames = false): MoodboardRef[] {
  if (!refs.some((r) => r.provider === 'upload')) return refs as MoodboardRef[];
  return refs.map((r) => {
    if (r.provider !== 'upload') return r;
    const url = (forFrames ? dataUrls.get(r.providerId) : objectUrls.get(r.providerId)) ?? '';
    return url ? { ...r, url, thumb: forFrames ? url : objectUrls.get(r.providerId) ?? url } : r;
  });
}

/** A board's refs, with uploads resolved as soon as their files are read. */
export function useUploads(refs: readonly MoodboardRef[], forFrames = false): MoodboardRef[] {
  const [tick, setTick] = useState(0);
  const key = refs
    .filter((r) => r.provider === 'upload')
    .map((r) => r.providerId)
    .join(',');
  useEffect(() => {
    if (!key) return;
    let live = true;
    preloadUploads(refs, forFrames).then(() => live && setTick((n) => n + 1));
    return () => {
      live = false;
    };
  }, [key, forFrames]); // eslint-disable-line react-hooks/exhaustive-deps
  return useMemo(() => withUploads(refs, forFrames), [refs, forFrames, tick]);
}

/** The colours most present in a picture: a small sample, bucketed, most frequent first. */
export async function sampleSwatches(src: string, max = 5): Promise<string[]> {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.src = src;
    await img.decode();
    const c = document.createElement('canvas');
    const W = 48;
    const H = Math.max(1, Math.round((img.naturalHeight / Math.max(1, img.naturalWidth)) * W));
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return [];
    ctx.drawImage(img, 0, 0, W, H);
    const px = ctx.getImageData(0, 0, W, H).data;
    const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 128) continue;
      const k = ((px[i] >> 4) << 8) | ((px[i + 1] >> 4) << 4) | (px[i + 2] >> 4);
      const v = buckets.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
      v.n++;
      v.r += px[i];
      v.g += px[i + 1];
      v.b += px[i + 2];
      buckets.set(k, v);
    }
    const hexOf = (v: { n: number; r: number; g: number; b: number }) => `#${[v.r, v.g, v.b].map((x) => Math.round(x / v.n).toString(16).padStart(2, '0')).join('')}`;
    const ranked = [...buckets.values()].sort((a, b) => b.n - a.n).map(hexOf);
    // keep colours that differ from those already kept
    const dist = (a: string, b: string) => {
      const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
      const [x, y] = [p(a), p(b)];
      return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
    };
    const out: string[] = [];
    for (const h of ranked) {
      if (out.every((o) => dist(o, h) > 48)) out.push(h);
      if (out.length >= max) break;
    }
    return out;
  } catch {
    // a library picture without CORS cannot be read: it simply has no swatches
    return [];
  }
}

async function scaled(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * k));
    const height = Math.max(1, Math.round(img.naturalHeight * k));
    if (file.type === 'image/gif' || k === 1) return { blob: file, width, height };
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    c.getContext('2d')!.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.86));
    return { blob: blob ?? file, width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function videoSize(file: File): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const v = document.createElement('video');
    v.muted = true;
    v.preload = 'metadata';
    v.src = url;
    await new Promise<void>((res, rej) => {
      v.onloadedmetadata = () => res();
      v.onerror = () => rej(new Error('unreadable'));
    });
    return { width: v.videoWidth || 1280, height: v.videoHeight || 720 };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** One file into a kept reference on the board, or why it cannot be. */
export async function addUpload(file: File): Promise<{ ok: true; ref: MoodboardRef } | { ok: false; error: string }> {
  const isImage = IMAGE.test(file.type);
  const isVideo = VIDEO.test(file.type);
  if (!isImage && !isVideo) return { ok: false, error: `“${file.name}” is not a picture or a clip SocriaUX can read (PNG, JPG, WebP, GIF, MP4 or WebM).` };
  if (isVideo && file.size > MAX_VIDEO) return { ok: false, error: `“${file.name}” is larger than 20 MB. A short clip is enough to show the movement.` };
  if (file.type === 'image/gif' && file.size > MAX_GIF) return { ok: false, error: `“${file.name}” is larger than 8 MB.` };
  if (isImage && file.size > MAX_IMAGE) return { ok: false, error: `“${file.name}” is larger than 15 MB.` };
  try {
    const id = fileId();
    const { blob, width, height } = isImage ? await scaled(file) : { blob: file, ...(await videoSize(file)) };
    const stored = await putArtifact({ id, name: file.name.slice(0, 160), type: blob.type || file.type, data: blob, bytes: blob.size, createdAt: Date.now() });
    if (!stored.ok) return { ok: false, error: stored.reason === 'quota' ? 'This browser has no room left for more references. Remove a few, or an imported design.' : 'This browser would not keep the file.' };
    media.set(id, blob);
    const objectUrl = URL.createObjectURL(blob);
    objectUrls.set(id, objectUrl);
    const swatches = isImage ? await sampleSwatches(objectUrl) : [];
    const ref = normalizeRef({
      provider: 'upload',
      providerId: id,
      width,
      height,
      color: swatches[0] ?? null,
      title: file.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').slice(0, 120),
      creator: 'You',
      license: 'Your own',
      attribution: 'Your own reference',
      category: 'imagery',
      state: 'kept',
      asContent: false,
      swatches,
      media: isVideo ? 'video' : 'image',
      // a clip is kept for how it moves
      ...(isVideo || file.type === 'image/gif' ? { take: ['motion'] } : {}),
    });
    return ref ? { ok: true, ref } : { ok: false, error: 'That file could not be added.' };
  } catch {
    return { ok: false, error: `“${file.name}” could not be read.` };
  }
}
