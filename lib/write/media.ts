// lib/write/media.ts — the pictures in a piece of writing, as bytes.
//
// A picture is not kept inside the document. The document travels with its
// conversation on every save, and is kept again in every version; a few
// photographs inside it would make each save megabytes and fill a phone's
// storage with copies. So a picture block holds only where its bytes are
// (`src: "m:<id>"`, lib/write/doc.ts) and the bytes are kept once: in this
// browser (components/write/media-client.ts) and, for a signed-in person, in
// private storage under their account (lib/write/media-store.ts), read back
// through /api/write/media. An id is 128 random bits, so knowing one is the
// only way to read one.
//
// What a picture is, is read from its own bytes — the first bytes say the
// format, the header says the size — never from a name or a type someone
// claimed for it.
//
// PURE.

export const MEDIA_ID = /^[a-f0-9]{32}$/;
/** Whose storage a picture is in: a digest of the account (lib/upload-paths.ts), never the account's id. */
export const MEDIA_OWNER = /^[a-f0-9]{24}$/;

export const MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

/** The most one picture may be, as kept — after the browser has made it smaller where it could. */
export const MAX_MEDIA_BYTES = 4 * 1024 * 1024;
/** A picture's longest side, as kept: enough for a full page at print resolution. */
export const MAX_EDGE = 2000;

/** A new picture's id: 128 random bits, as hex. */
export function newMediaId(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

export const srcOf = (id: string) => `m:${id}`;
export const mediaIdOf = (src: string | undefined): string | null => (src && /^m:[a-f0-9]{32}$/.test(src) ? src.slice(2) : null);

/**
 * Every picture a stored draft (`{ title, html, doc }`) points at — in its
 * writing and in its versions — read defensively, as whatever was saved.
 */
export function draftMediaIds(draft: unknown): string[] {
  const doc = draft && typeof draft === 'object' ? (draft as { doc?: unknown }).doc : null;
  if (!doc || typeof doc !== 'object') return [];
  const blocksOf = (x: unknown): unknown[] => (x && typeof x === 'object' && Array.isArray((x as { blocks?: unknown }).blocks) ? (x as { blocks: unknown[] }).blocks : []);
  const versions = (doc as { versions?: unknown }).versions;
  const out = new Set<string>();
  for (const b of [...blocksOf(doc), ...(Array.isArray(versions) ? versions.flatMap(blocksOf) : [])]) {
    const id = mediaIdOf(b && typeof b === 'object' ? ((b as { src?: unknown }).src as string | undefined) : undefined);
    if (id) out.add(id);
  }
  return Array.from(out);
}

export function extOf(type: MediaType): string {
  return type === 'image/jpeg' ? 'jpeg' : type.slice(6);
}

const at = (b: Uint8Array, i: number) => (i < b.length ? b[i] : 0);
const ascii = (b: Uint8Array, s: number, n: number) => String.fromCharCode(...Array.from(b.subarray(s, s + n)));

/** The format, from the bytes themselves. */
export function sniffImage(b: Uint8Array): MediaType | null {
  if (b.length < 12) return null;
  if (at(b, 0) === 0x89 && ascii(b, 1, 3) === 'PNG' && at(b, 4) === 0x0d && at(b, 5) === 0x0a) return 'image/png';
  if (at(b, 0) === 0xff && at(b, 1) === 0xd8 && at(b, 2) === 0xff) return 'image/jpeg';
  if (ascii(b, 0, 6) === 'GIF87a' || ascii(b, 0, 6) === 'GIF89a') return 'image/gif';
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'image/webp';
  return null;
}

export interface JpegInfo {
  w: number;
  h: number;
  /** 1 grey, 3 colour, 4 CMYK */
  comps: number;
  /** the frame marker: baseline, extended or progressive */
  progressive: boolean;
}

/** A JPEG's frame header: its size and how many colour components it has. */
export function jpegInfo(b: Uint8Array): JpegInfo | null {
  if (at(b, 0) !== 0xff || at(b, 1) !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = b[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0xff) {
      i += marker === 0xff ? 1 : 2;
      continue;
    }
    const len = (b[i + 2] << 8) | b[i + 3];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const h = (b[i + 5] << 8) | b[i + 6];
      const w = (b[i + 7] << 8) | b[i + 8];
      const comps = b[i + 9];
      if (!w || !h) return null;
      return { w, h, comps, progressive: marker === 0xc2 || marker === 0xc6 || marker === 0xca || marker === 0xce };
    }
    if (len < 2) return null;
    i += 2 + len;
  }
  return null;
}

/**
 * Which way up a camera's JPEG is meant to be shown (EXIF orientation, 1–8;
 * 1 is as stored). A photo taken on its side is stored on its side, with this
 * saying so — and a PDF or a Word file would show it on its side.
 */
export function jpegOrientation(b: Uint8Array): number {
  if (at(b, 0) !== 0xff || at(b, 1) !== 0xd8) return 1;
  let i = 2;
  while (i + 4 < b.length) {
    if (b[i] !== 0xff) return 1;
    const marker = b[i + 1];
    const len = (b[i + 2] << 8) | b[i + 3];
    if (marker === 0xda || len < 2) return 1;
    if (marker === 0xe1 && ascii(b, i + 4, 4) === 'Exif') {
      const t = i + 10;
      const le = ascii(b, t, 2) === 'II';
      const u16 = (o: number) => (le ? at(b, o) | (at(b, o + 1) << 8) : (at(b, o) << 8) | at(b, o + 1));
      const u32 = (o: number) => (le ? (at(b, o) | (at(b, o + 1) << 8) | (at(b, o + 2) << 16) | (at(b, o + 3) << 24)) >>> 0 : ((at(b, o) << 24) | (at(b, o + 1) << 16) | (at(b, o + 2) << 8) | at(b, o + 3)) >>> 0);
      const ifd = t + u32(t + 4);
      const n = u16(ifd);
      for (let k = 0; k < Math.min(n, 64); k++) {
        const e = ifd + 2 + k * 12;
        if (u16(e) === 0x0112) {
          const v = u16(e + 8);
          return v >= 1 && v <= 8 ? v : 1;
        }
      }
      return 1;
    }
    i += 2 + len;
  }
  return 1;
}

/** A picture's size in pixels, from its header. */
export function imageSize(b: Uint8Array, type: MediaType | null = sniffImage(b)): { w: number; h: number } | null {
  if (!type) return null;
  if (type === 'image/png') {
    if (b.length < 24 || ascii(b, 12, 4) !== 'IHDR') return null;
    const w = ((b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]) >>> 0;
    const h = ((b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23]) >>> 0;
    return w && h ? { w, h } : null;
  }
  if (type === 'image/gif') {
    const w = b[6] | (b[7] << 8);
    const h = b[8] | (b[9] << 8);
    return w && h ? { w, h } : null;
  }
  if (type === 'image/jpeg') {
    const j = jpegInfo(b);
    return j ? { w: j.w, h: j.h } : null;
  }
  // WebP: lossy, lossless, or extended
  const chunk = ascii(b, 12, 4);
  if (chunk === 'VP8 ' && b.length >= 30) {
    const w = (b[26] | (b[27] << 8)) & 0x3fff;
    const h = (b[28] | (b[29] << 8)) & 0x3fff;
    return w && h ? { w, h } : null;
  }
  if (chunk === 'VP8L' && b.length >= 25) {
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X' && b.length >= 30) {
    const w = (b[24] | (b[25] << 8) | (b[26] << 16)) + 1;
    const h = (b[27] | (b[28] << 8) | (b[29] << 16)) + 1;
    return { w, h };
  }
  return null;
}

/** A data address's bytes, when it is a picture in one of the formats kept here. */
export function dataUrlBytes(url: string): { bytes: Uint8Array; type: MediaType } | null {
  const m = /^data:(image\/(?:png|jpe?g|gif|webp));base64,([A-Za-z0-9+/=\s]+)$/i.exec(url);
  if (!m) return null;
  let bin: string;
  try {
    bin = atob(m[2].replace(/\s+/g, ''));
  } catch {
    return null;
  }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const type = sniffImage(bytes);
  return type ? { bytes, type } : null;
}

/** Bytes as a data address — for an export that must carry its pictures inside it. */
export function bytesToDataUrl(bytes: Uint8Array, type: string): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...Array.from(bytes.subarray(i, i + 0x8000)));
  return `data:${type};base64,${btoa(bin)}`;
}
