// lib/image-kind.ts — is this a photo, and what kind: by what the browser
// calls it, by its name, and by its first bytes.
//
// A phone does not always say. A photo from the camera roll arrives as
// image/jpeg; the same photo from Files, Drive or a chat app may come with no
// type at all, as "image/jpg", or named .jfif; an iPhone's original is HEIC,
// which most browsers cannot open. So a photo is known by any of the three,
// and its bytes have the last word on how it is opened (lib/logos-upload.ts).
//
// PURE.

export type PhotoFormat = 'jpeg' | 'png' | 'gif' | 'webp' | 'bmp' | 'heic' | 'avif';

/** What browsers and phones call each one — the standard names and the ones seen in the wild. */
const BY_TYPE: Record<string, PhotoFormat> = {
  'image/jpeg': 'jpeg',
  'image/jpg': 'jpeg',
  'image/pjpeg': 'jpeg',
  'image/jfif': 'jpeg',
  'image/pjp': 'jpeg',
  'image/png': 'png',
  'image/x-png': 'png',
  'image/apng': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/x-ms-bmp': 'bmp',
  'image/heic': 'heic',
  'image/heif': 'heic',
  'image/heic-sequence': 'heic',
  'image/heif-sequence': 'heic',
  'image/avif': 'avif',
};

const BY_NAME: Record<string, PhotoFormat> = {
  jpg: 'jpeg',
  jpeg: 'jpeg',
  jpe: 'jpeg',
  jfif: 'jpeg',
  pjpeg: 'jpeg',
  pjp: 'jpeg',
  png: 'png',
  apng: 'png',
  gif: 'gif',
  webp: 'webp',
  bmp: 'bmp',
  heic: 'heic',
  heif: 'heic',
  hif: 'heic',
  avif: 'avif',
};

/** A type that says nothing: the file is known by its name instead. */
const SAYS_NOTHING = new Set(['', 'application/octet-stream', 'binary/octet-stream', 'application/unknown']);

/**
 * The kind of photo a file says it is — by its type, or by its name when the
 * type says nothing. A type that names something else is believed: a PDF
 * called photo.jpg is not a photo.
 */
export function photoFormatOf(f: { type?: string; name?: string }): PhotoFormat | null {
  const type = (f.type ?? '').toLowerCase().split(';')[0].trim();
  if (BY_TYPE[type]) return BY_TYPE[type];
  if (!SAYS_NOTHING.has(type) && !type.startsWith('image/')) return null;
  const ext = /\.([a-z0-9]+)$/i.exec((f.name ?? '').trim())?.[1]?.toLowerCase() ?? '';
  return BY_NAME[ext] ?? null;
}

export const isPhotoFile = (f: { type?: string; name?: string }): boolean => photoFormatOf(f) !== null;

const ascii = (b: Uint8Array, from: number, len: number) => String.fromCharCode(...b.subarray(from, from + len));

/** HEIF brands: the HEVC ones are HEIC; "mif1"/"msf1" are the container, decided by what else it lists. */
const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs']);
const AVIF_BRANDS = new Set(['avif', 'avis']);

/**
 * What a file is, from its first bytes (32 are enough; 64 read the brands of
 * a HEIF file fully). Null for anything that is not a photo this can open.
 */
export function sniffPhoto(b: Uint8Array): PhotoFormat | null {
  if (b.length < 4) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b[0] === 0x89 && ascii(b, 1, 3) === 'PNG' && b[4] === 0x0d && b[5] === 0x0a) return 'png';
  if (ascii(b, 0, 4) === 'GIF8') return 'gif';
  if (ascii(b, 0, 4) === 'RIFF' && b.length >= 12 && ascii(b, 8, 4) === 'WEBP') return 'webp';
  if (b[0] === 0x42 && b[1] === 0x4d && b.length >= 14) return 'bmp';
  // ISO base media: [size][ftyp][major brand][minor version][compatible brands…]
  if (b.length >= 12 && ascii(b, 4, 4) === 'ftyp') {
    const size = ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
    const end = Math.min(b.length, size >= 16 ? size : 16);
    const brands = [ascii(b, 8, 4)];
    for (let i = 16; i + 4 <= end; i += 4) brands.push(ascii(b, i, 4));
    if (brands.some((x) => AVIF_BRANDS.has(x))) return 'avif';
    if (brands.some((x) => HEIC_BRANDS.has(x) || x === 'mif1' || x === 'msf1')) return 'heic';
  }
  return null;
}

/** What a photo is called when the person is told about it. */
export const PHOTO_WORD: Record<PhotoFormat, string> = { jpeg: 'JPEG', png: 'PNG', gif: 'GIF', webp: 'WebP', bmp: 'BMP', heic: 'HEIC', avif: 'AVIF' };

/**
 * The sizes a picture is stepped down through on its way to `w`×`h`: halved
 * while it is still more than twice as big, because one jump from a 4000px
 * photo to a 220px thumbnail leaves it jagged. A step larger than `maxArea`
 * pixels is skipped (a phone's canvas has a ceiling — about 16.7 million on
 * an iPhone), so the first one drawn always fits.
 */
export function stepSizes(sw: number, sh: number, w: number, h: number, maxArea = 16_000_000): [number, number][] {
  const out: [number, number][] = [];
  let cw = sw;
  let ch = sh;
  while (cw > w * 2 && ch > h * 2) {
    cw = Math.max(w, Math.round(cw / 2));
    ch = Math.max(h, Math.round(ch / 2));
    if (cw * ch <= maxArea && (cw > w || ch > h)) out.push([cw, ch]);
  }
  return out;
}

/** The size that fits within `maxEdge` on its long side, never larger than it was. */
export function fitWithin(w: number, h: number, maxEdge: number): [number, number] {
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  return [Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale))];
}
