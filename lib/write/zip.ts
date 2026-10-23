// lib/write/zip.ts — the zip inside a Word file, written and read in the browser.
//
// A .docx is a zip of XML. Writing one needs no compression at all — "stored"
// entries are valid in every reader, and a document's XML is small — so the
// writer is a few dozen lines and synchronous. Reading one written elsewhere
// needs inflating, done with the platform's own DecompressionStream, and a
// zip is untrusted input with a famous failure: a few KB that inflate to
// gigabytes. Inflation stops at a ceiling; the sizes a zip declares about
// itself are never trusted for that.
//
// PURE apart from DecompressionStream (every current browser, and Node 18+).

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipFile {
  name: string;
  data: Uint8Array;
}

/** Files into a zip of stored (uncompressed) entries, in the order given. */
export function zipStore(files: ZipFile[], when: Date = new Date()): Uint8Array {
  const enc = new TextEncoder();
  const time = ((when.getHours() & 31) << 11) | ((when.getMinutes() & 63) << 5) | (Math.floor(when.getSeconds() / 2) & 31);
  const date = (((Math.max(1980, when.getFullYear()) - 1980) & 127) << 9) | (((when.getMonth() + 1) & 15) << 5) | (when.getDate() & 31);
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // names are UTF-8
    lv.setUint16(8, 0, true); // stored
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, f.data.length, true);
    lv.setUint32(22, f.data.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);
    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, f.data.length, true);
    cv.setUint32(24, f.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    locals.push(local, f.data);
    centrals.push(central);
    offset += local.length + f.data.length;
  }
  const cdSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  return concat([...locals, ...centrals, end]);
}

export function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** The most one entry may inflate to, and all of them together. */
export const MAX_ENTRY = 16 * 1024 * 1024;
export const MAX_TOTAL = 40 * 1024 * 1024;
const MAX_ENTRIES = 2000;

export class ZipError extends Error {}

/** The named entries of a zip, inflated within the ceilings. Others are never touched. */
export async function unzipSome(buf: Uint8Array, want: (name: string) => boolean): Promise<Map<string, Uint8Array>> {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65_535); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipError('This is not a Word document (.docx) — it could not be opened.');
  const count = v.getUint16(eocd + 10, true);
  const cdOffset = v.getUint32(eocd + 16, true);
  if (count === 0xffff || cdOffset === 0xffffffff) throw new ZipError('This file is too large to open here.');
  const dec = new TextDecoder('utf-8');
  const out = new Map<string, Uint8Array>();
  let total = 0;
  let p = cdOffset;
  for (let n = 0; n < Math.min(count, MAX_ENTRIES); n++) {
    if (p + 46 > buf.length || v.getUint32(p, true) !== 0x02014b50) break;
    const flags = v.getUint16(p + 8, true);
    const method = v.getUint16(p + 10, true);
    const size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const commentLen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!want(name)) continue;
    if (flags & 1) throw new ZipError('This document is password-protected — remove the password in Word, then try again.');
    if (local + 30 > buf.length || v.getUint32(local, true) !== 0x04034b50) continue;
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const raw = buf.subarray(start, Math.min(buf.length, start + size));
    let data: Uint8Array;
    if (method === 0) data = raw;
    else if (method === 8) data = await inflateRaw(raw, Math.min(MAX_ENTRY, MAX_TOTAL - total));
    else throw new ZipError('This document is compressed in a way that cannot be read here.');
    total += data.length;
    if (total > MAX_TOTAL) throw new ZipError('This document is too large to open here.');
    out.set(name, data);
  }
  return out;
}

async function inflateRaw(data: Uint8Array, limit: number): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') throw new ZipError('This browser cannot open Word documents — try a current version of Chrome, Safari, Edge or Firefox.');
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  // the copy keeps the buffer type the stream expects
  void writer.write(new Uint8Array(data)).catch(() => undefined);
  void writer.close().catch(() => undefined);
  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limit) {
        await reader.cancel().catch(() => undefined);
        throw new ZipError('This document is too large to open here.');
      }
      chunks.push(value);
    }
  } catch (e) {
    if (e instanceof ZipError) throw e;
    throw new ZipError('This document is damaged — it could not be opened.');
  }
  return concat(chunks);
}
