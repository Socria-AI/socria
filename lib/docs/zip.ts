import 'server-only';
// lib/docs/zip.ts — the inside of an Office file, opened safely.
//
// .docx, .xlsx, .pptx and the OpenDocument formats are zip archives of XML.
// A zip is untrusted input with a famous failure mode: a few KB that inflate
// to gigabytes. Node's zlib is used rather than a JS unzipper precisely for
// `maxOutputLength`, which makes inflation STOP at a ceiling instead of
// discovering the size after the memory is gone. The sizes a zip declares
// about itself are never trusted for that. (Moved here from lib/file-extract.ts,
// which reads plain archives with it too.)

import { inflateRawSync } from 'node:zlib';

/** The most any one archive may inflate to, in total. */
export const MAX_INFLATED_TOTAL = 40 * 1024 * 1024;
/** The most any one entry may inflate to. */
export const MAX_INFLATED_ENTRY = 16 * 1024 * 1024;
/** Entries looked at in an archive; a node_modules zip is not a document. */
export const MAX_ENTRIES = 400;

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  localOffset: number;
  encrypted: boolean;
}

function readZipDirectory(buf: Buffer): ZipEntry[] {
  // End of central directory: 22 bytes plus a comment of up to 65535.
  const floor = Math.max(0, buf.length - 65_557);
  let eocd = -1;
  for (let i = buf.length - 22; i >= floor; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out: ZipEntry[] = [];
  for (let n = 0; n < count && n < MAX_ENTRIES * 4; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) break;
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    out.push({ name, method, compressedSize, localOffset, encrypted: (flags & 1) === 1 });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** One entry's bytes, inflated under a hard ceiling. */
function readZipEntry(buf: Buffer, e: ZipEntry, budget: { left: number }): Buffer {
  if (e.encrypted) throw new Error('it is password-protected');
  // ZIP64 markers: sizes that do not fit 32 bits. Not supported, and not
  // something a document attached to a conversation needs.
  if (e.compressedSize === 0xffffffff || e.localOffset === 0xffffffff) throw new Error('it is too large');
  const lh = e.localOffset;
  if (lh + 30 > buf.length || buf.readUInt32LE(lh) !== 0x04034b50) throw new Error('the archive is damaged');
  const start = lh + 30 + buf.readUInt16LE(lh + 26) + buf.readUInt16LE(lh + 28);
  const raw = buf.subarray(start, start + e.compressedSize);
  const ceiling = Math.min(MAX_INFLATED_ENTRY, budget.left);
  if (ceiling <= 0) throw new Error('the archive is too large');
  let data: Buffer;
  if (e.method === 0) data = Buffer.from(raw);
  else if (e.method === 8) {
    try {
      data = inflateRawSync(raw, { maxOutputLength: ceiling });
    } catch (err) {
      if (err instanceof RangeError || /maxOutputLength|buffer/i.test(String(err))) {
        throw new Error('it inflates to more than Socria will read');
      }
      throw new Error('the archive is damaged');
    }
  } else throw new Error('it uses a compression method Socria cannot read');
  if (data.length > ceiling) throw new Error('it inflates to more than Socria will read');
  budget.left -= data.length;
  return data;
}

/**
 * An archive's entries by name, each read (and inflated) only when asked for.
 * `budget` is what may still be inflated — shared with any archive opened
 * from inside this one, so nesting cannot multiply the ceiling.
 */
export function unzip(buf: Buffer, budget: { left: number } = { left: MAX_INFLATED_TOTAL }): Map<string, () => Buffer> {
  const map = new Map<string, () => Buffer>();
  for (const e of readZipDirectory(buf)) {
    if (e.name.endsWith('/')) continue;
    map.set(e.name, () => readZipEntry(buf, e, budget));
  }
  return map;
}

/** One entry as UTF-8 text, or null when it is not there. */
export function part(files: Map<string, () => Buffer>, name: string): string | null {
  const get = files.get(name);
  return get ? get().toString('utf8') : null;
}
