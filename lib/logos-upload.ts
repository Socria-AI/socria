// lib/logos-upload.ts
//
// Browser-side file handling. Never import this from a route — it needs canvas.
//
// Three sizes come out of every photo: a wide one that goes to the vision pass
// once, a picture the conversation shows (720px, opened large when pressed),
// and a thumbnail for the chip. Full-resolution uploads are never stored or
// re-sent; a session's worth of original photos in a database row helps nobody.
//
// A phone's photo is taken however it comes: whatever the browser calls it
// (often nothing, or "image/jpg"), its first bytes decide what it is
// (lib/image-kind.ts); it is opened the right way up; and a HEIC the browser
// cannot open is converted here, in the browser, before anything is sent.

import { fitWithin, isPhotoFile, PHOTO_WORD, sniffPhoto, stepSizes, type PhotoFormat } from './image-kind';

export const READ_MAX_EDGE = 1400;
/** An easy view reads small print, so its photo keeps more of it (app/api/logos/easy). */
export const EASY_READ_EDGE = 2048;
export const THUMB_MAX_EDGE = 220;
/**
 * The picture as shown in a conversation — big enough to look at on a phone,
 * small enough that a conversation of photos still saves in one request (and
 * in a signed-out browser's storage): 720px, stepped down until it fits.
 */
export const PREVIEW_MAX_EDGE = 720;
/** Within lib/logos-attachments.ts MAX_PREVIEW_CHARS, with room to spare: ~75KB of picture. */
export const PREVIEW_BUDGET_CHARS = 100_000;
/** Text files: read as they are. */
export const MAX_FILE_BYTES = 12 * 1024 * 1024;
/**
 * The largest photo taken: a phone's 50-megapixel JPEG is 15–25 MB, and every
 * photo is made small here before anything is sent.
 */
export const MAX_IMAGE_BYTES = 30 * 1024 * 1024;

/**
 * What a photo picker is asked for. "image/*" lets a phone offer every photo it
 * has — and lets an iPhone hand over its HEIC photos as JPEGs, as it does when
 * a page does not ask for HEIC by name.
 */
export const IMAGE_ACCEPT = 'image/*';
export const ACCEPTED_TEXT = ['text/plain', 'text/markdown', 'text/csv', 'application/json'];

/** A photo — by what the browser calls it, or by its name when it calls it nothing (lib/image-kind.ts). */
export function isImageFile(f: { type?: string; name?: string }): boolean {
  return isPhotoFile(f);
}

/**
 * A photo by its first bytes — for a file that says nothing about itself (no
 * type, no extension: a photo saved from a chat app, or out of a cloud drive).
 * Read only when the type and the name have not already decided.
 */
export async function isPhotoByBytes(f: Blob): Promise<boolean> {
  try {
    return sniffPhoto(new Uint8Array(await f.slice(0, 64).arrayBuffer())) !== null;
  } catch {
    return false;
  }
}

/** Says nothing about itself: the bytes are asked (isPhotoByBytes). */
export const saysNothing = (f: { type?: string }) => !f.type || f.type === 'application/octet-stream';

export function isTextFile(f: File): boolean {
  return ACCEPTED_TEXT.includes(f.type) || /\.(txt|md|markdown|csv|json|log)$/i.test(f.name);
}

/** What the person is told, in words that say what to do next. */
export const PHOTO_SAYS = {
  notPhoto: 'That file isn’t a photo this can open — choose a JPEG, PNG, HEIC or WebP picture.',
  cannotOpen: 'That photo couldn’t be opened on this device. Try it again, or take a screenshot of it and send that.',
  heicFailed: 'That HEIC photo couldn’t be converted here. Send it as a JPEG instead — on an iPhone, Settings › Camera › Formats › Most Compatible.',
} as const;

/** A decoded picture, ready to draw, and how to let it go. */
interface Picture {
  src: CanvasImageSource;
  w: number;
  h: number;
  done: () => void;
}

/**
 * The browser's own decoder, through an <img>: it turns a phone photo the
 * right way up (EXIF orientation) on every current browser, and opens HEIC
 * where it can (Safari). From an object URL, not a base64 copy of the file —
 * a 20 MB photo as a data URL is 27 MB of string before it is even decoded.
 */
function viaElement(blob: Blob): Promise<Picture> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      if (!img.naturalWidth || !img.naturalHeight) {
        URL.revokeObjectURL(url);
        return reject(new Error('empty'));
      }
      resolve({ src: img, w: img.naturalWidth, h: img.naturalHeight, done: () => URL.revokeObjectURL(url) });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('undecodable'));
    };
    img.src = url;
  });
}

/** The same decoder by another door, for a browser whose <img> would not take it. */
async function viaBitmap(blob: Blob): Promise<Picture> {
  if (typeof createImageBitmap !== 'function') throw new Error('no bitmap');
  const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  return { src: bmp, w: bmp.width, h: bmp.height, done: () => bmp.close() };
}

/**
 * HEIC where the browser cannot open it (Chrome, Firefox, Android): converted
 * here, in the browser, by libheif compiled to WebAssembly (heic-to). It is
 * loaded only now — about 3 MB, fetched once, by the people who need it — and
 * decodes in a worker, the photo turned as the camera meant.
 */
async function viaHeicDecoder(blob: Blob): Promise<Picture> {
  const { heicTo } = await import('heic-to/next');
  const bmp = await heicTo({ blob, type: 'bitmap' });
  return { src: bmp, w: bmp.width, h: bmp.height, done: () => bmp.close() };
}

/** Open a photo, whatever it is: the browser first, then the HEIC decoder for a HEIC it could not open. */
async function openPicture(file: Blob, format: PhotoFormat, onConvert?: () => void): Promise<Picture> {
  const native = (await viaElement(file).catch(() => null)) ?? (await viaBitmap(file).catch(() => null));
  if (native) return native;
  if (format !== 'heic') throw new Error(PHOTO_SAYS.cannotOpen);
  onConvert?.();
  try {
    return await viaHeicDecoder(file);
  } catch {
    throw new Error(PHOTO_SAYS.heicFailed);
  }
}

function canvasOf(w: number, h: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error(PHOTO_SAYS.cannotOpen);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return { c, ctx };
}

/**
 * The picture made `maxEdge` on its long side, stepped down by halves so a
 * small version stays sharp (lib/image-kind.ts stepSizes), on a white ground —
 * photos of whiteboards and menus have no transparency, and JPEG would fill
 * it with black.
 */
function scaled(src: CanvasImageSource, sw: number, sh: number, maxEdge: number): HTMLCanvasElement {
  const [w, h] = fitWithin(sw, sh, maxEdge);
  let cur: CanvasImageSource = src;
  let cw = sw;
  let ch = sh;
  for (const [iw, ih] of stepSizes(sw, sh, w, h)) {
    const { c, ctx } = canvasOf(iw, ih);
    ctx.drawImage(cur, 0, 0, cw, ch, 0, 0, iw, ih);
    cur = c;
    cw = iw;
    ch = ih;
  }
  const { c, ctx } = canvasOf(w, h);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(cur, 0, 0, cw, ch, 0, 0, w, h);
  return c;
}

const jpeg = (c: HTMLCanvasElement, q: number) => c.toDataURL('image/jpeg', q);

export interface PreparedImage {
  /** wide version, sent once to be read, then dropped */
  full: string;
  /** small version, for the chip and the lists */
  thumb: string;
  /**
   * The version a conversation SHOWS, and opens large when pressed: a real
   * picture, not a chip. Stepped down in quality until it fits what is stored
   * with the message ('' when even the smallest step would not).
   */
  preview: string;
  name: string;
  /** what it was, as the person would call it ("HEIC"), when it was converted to be read */
  convertedFrom?: string;
}

export interface PrepareOptions {
  /** called when a HEIC photo has to be converted here first — a second or two on a phone */
  onConvert?: () => void;
}

/**
 * `maxBytes` is the largest original accepted; it can be far larger than what
 * is sent, because every photo is made small here before it leaves the
 * browser. Whatever the phone calls the file, its first bytes decide what it
 * is; a HEIC the browser cannot open is converted.
 */
export async function prepareImage(file: File, maxBytes = MAX_IMAGE_BYTES, readEdge = READ_MAX_EDGE, opts: PrepareOptions = {}): Promise<PreparedImage> {
  if (file.size > maxBytes) {
    throw new Error(`That photo is too large — ${Math.round(maxBytes / (1024 * 1024))} MB is the limit. A screenshot of it works too.`);
  }
  if (!file.size) throw new Error(PHOTO_SAYS.notPhoto);
  const format = sniffPhoto(new Uint8Array(await file.slice(0, 64).arrayBuffer()));
  if (!format) throw new Error(PHOTO_SAYS.notPhoto);
  let converted = false;
  const pic = await openPicture(file, format, () => {
    converted = true;
    opts.onConvert?.();
  });
  try {
    // largest first, each smaller one drawn from the one before: sharp, and the photo decoded once
    const full = scaled(pic.src, pic.w, pic.h, readEdge);
    const shown = scaled(full, full.width, full.height, PREVIEW_MAX_EDGE);
    let preview = '';
    for (const [edge, q] of [[PREVIEW_MAX_EDGE, 0.8], [PREVIEW_MAX_EDGE, 0.68], [600, 0.64], [480, 0.6]] as const) {
      preview = jpeg(edge === PREVIEW_MAX_EDGE ? shown : scaled(shown, shown.width, shown.height, edge), q);
      if (preview.length <= PREVIEW_BUDGET_CHARS) break;
    }
    return {
      full: jpeg(full, 0.85),
      thumb: jpeg(scaled(shown, shown.width, shown.height, THUMB_MAX_EDGE), 0.72),
      preview: preview.length <= PREVIEW_BUDGET_CHARS ? preview : '',
      name: file.name || 'Photo',
      ...(converted ? { convertedFrom: PHOTO_WORD[format] } : {}),
    };
  } finally {
    pic.done();
  }
}

/**
 * Any photo this can open, as a JPEG of at most `maxEdge` — for a place with
 * its own picture handling that takes only the common kinds (the writing's
 * pictures), so a HEIC, an AVIF or a BMP arrives as something it takes.
 */
export async function toJpegBlob(blob: Blob, maxEdge = 4096, opts: PrepareOptions = {}): Promise<Blob> {
  if (blob.size > MAX_IMAGE_BYTES) throw new Error(`That photo is too large — ${Math.round(MAX_IMAGE_BYTES / (1024 * 1024))} MB is the limit.`);
  const format = sniffPhoto(new Uint8Array(await blob.slice(0, 64).arrayBuffer()));
  if (!format) throw new Error(PHOTO_SAYS.notPhoto);
  const pic = await openPicture(blob, format, opts.onConvert);
  try {
    const c = scaled(pic.src, pic.w, pic.h, maxEdge);
    const out = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, 'image/jpeg', 0.88));
    if (!out) throw new Error(PHOTO_SAYS.cannotOpen);
    return out;
  } finally {
    pic.done();
  }
}

/** The same, as a file with a .jpg name — for a place that stores the file itself (a profile picture). */
export async function photoAsJpeg(file: File, maxEdge: number, opts: PrepareOptions = {}): Promise<File> {
  const blob = await toJpegBlob(file, maxEdge, opts);
  return new File([blob], `${(file.name || 'photo').replace(/\.[a-z0-9]+$/i, '')}.jpg`, { type: 'image/jpeg' });
}

export async function readTextFile(file: File): Promise<{ text: string; name: string }> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('That file is too large.');
  }
  const text = await file.text();
  return { text: text.replace(/\r\n/g, '\n'), name: file.name || 'note' };
}
