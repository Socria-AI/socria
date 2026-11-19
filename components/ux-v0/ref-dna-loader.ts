// components/ux-v0/ref-dna-loader.ts — a moodboard reference's pixels, read in this browser, measured once.
//
// The picture is drawn small (96 px on its long side) on a canvas and its pixels measured by
// lib/ux-v0/ref-dna.ts: negative space, density, contrast, colour, symmetry, the run of its lines, rhythm, grain.
// A moving reference (a clip) is read at a few moments, for its movement too. Nothing leaves the browser and no
// model is asked: it is arithmetic on pixels, free. A library that does not let its pictures be read (no CORS)
// cannot be measured, and the result says so rather than guessing.

import { refDnaOf, type Pixels } from '@/lib/ux-v0/ref-dna';
import type { RefDna } from '@/lib/ux-v0/dna';

const EDGE = 96;

export type Measured = { ok: true; dna: RefDna } | { ok: false; reason: string };

function canvasFor(w: number, h: number) {
  const W = w >= h ? EDGE : Math.max(8, Math.round((w / Math.max(1, h)) * EDGE));
  const H = h > w ? EDGE : Math.max(8, Math.round((h / Math.max(1, w)) * EDGE));
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  return { c, ctx, W, H };
}

const UNREADABLE = 'This library does not let its pictures be read, so it could not be measured. Add your own copy to measure it.';

async function picture(src: string): Promise<Pixels> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.decoding = 'async';
  img.src = src;
  await img.decode();
  const { ctx, W, H } = canvasFor(img.naturalWidth, img.naturalHeight);
  if (!ctx) throw new Error('no canvas');
  ctx.drawImage(img, 0, 0, W, H);
  const d = ctx.getImageData(0, 0, W, H);
  return { width: W, height: H, data: d.data };
}

async function clip(src: string): Promise<Pixels[]> {
  const v = document.createElement('video');
  v.crossOrigin = 'anonymous';
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  v.src = src;
  await new Promise<void>((ok, no) => {
    v.onloadeddata = () => ok();
    v.onerror = () => no(new Error('the clip could not be loaded'));
    setTimeout(() => no(new Error('the clip took too long to load')), 8000);
  });
  const { ctx, W, H } = canvasFor(v.videoWidth || 16, v.videoHeight || 9);
  if (!ctx) throw new Error('no canvas');
  const at = async (t: number) => {
    await new Promise<void>((ok) => {
      const done = () => (v.removeEventListener('seeked', done), ok());
      v.addEventListener('seeked', done);
      v.currentTime = Math.max(0, Math.min(t, Math.max(0, (v.duration || 0) - 0.05)));
      setTimeout(done, 1500);
    });
    ctx.drawImage(v, 0, 0, W, H);
    const d = ctx.getImageData(0, 0, W, H);
    return { width: W, height: H, data: new Uint8ClampedArray(d.data) };
  };
  // three moments, each with the frame a fifth of a second later: what moves between them
  const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 1;
  const frames: Pixels[] = [];
  for (const f of [0.25, 0.5, 0.75]) {
    frames.push(await at(dur * f));
    frames.push(await at(dur * f + 0.2));
  }
  return frames;
}

/** Measure a reference from what this browser can show of it (`src`: its picture's address or an upload's). */
export async function measureReference(src: string, media: 'image' | 'video' | undefined, of: string): Promise<Measured> {
  if (!src) return { ok: false, reason: 'The picture is not available in this browser.' };
  try {
    if (media === 'video') {
      const frames = await clip(src);
      // pairs a fifth of a second apart: the movement is read within each pair, the picture from the first
      const pairs: Pixels[][] = [];
      for (let i = 0; i + 1 < frames.length; i += 2) pairs.push([frames[i], frames[i + 1]]);
      const base = refDnaOf(pairs[0], of);
      const moves = pairs.map((p) => refDnaOf(p, of).votes.motion ?? 0);
      const motion = Math.round(moves.reduce((a, b) => a + b, 0) / Math.max(1, moves.length));
      return { ok: true, dna: { ...base, votes: { ...base.votes, motion } } };
    }
    return { ok: true, dna: refDnaOf(await picture(src), of) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    // reading a picture another site serves without CORS throws a SecurityError on getImageData, or fails to decode
    if (/security|tainted|cross-origin|decode|load/i.test(`${(e as { name?: string })?.name ?? ''} ${msg}`)) return { ok: false, reason: UNREADABLE };
    return { ok: false, reason: msg ? `It could not be measured: ${msg}.` : 'It could not be measured.' };
  }
}
