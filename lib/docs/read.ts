import 'server-only';
// lib/docs/read.ts — any file Socria reads, into a checked SourceDoc.
//
// One door for every format: the bytes are hashed (the same file is the same
// document, wherever it is attached), handed to the reader for their format,
// checked against the file's own text (lib/docs/checks.ts), and made safe to
// travel (lib/docs/sanitize.ts). An image is a document too — one page,
// waiting for a vision reading, which happens in the browser's next step and
// never here (lib/docs/vision.ts).
//
// Nothing is kept: the bytes are read in memory and dropped when this
// returns, as the file reader's route promises.

import { createHash } from 'node:crypto';
import { extensionOf, IMAGE_EXTENSIONS } from '../file-kinds';
import { DocBuilder, type MediaRef, type ReaderOut } from './build';
import { checkDoc } from './checks';
import { readDocx } from './docx';
import { readOdf } from './odf';
import type { OfficeParts } from './office';
import { readPdf } from './pdf';
import { readPlain } from './plain';
import { readPptx } from './pptx';
import { readRtf } from './rtf';
import { sanitizeSourceDoc } from './sanitize';
import type { DocCheck, SourceDoc } from './types';
import { readXlsx } from './xlsx';
import { MAX_INFLATED_TOTAL, unzip } from './zip';

/** A document's id: the first 16 hex characters of its bytes' SHA-256. */
export function docIdOf(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 16);
}

/** An Office or OpenDocument package, opened — every part inflated once, under one shared ceiling. */
export function partsOf(buf: Buffer, budget: { left: number } = { left: MAX_INFLATED_TOTAL }, depth = 0): OfficeParts {
  const files = unzip(buf, budget);
  const cache = new Map<string, Buffer>();
  const get = (n: string): Buffer | null => {
    const hit = cache.get(n);
    if (hit) return hit;
    const g = files.get(n);
    if (!g) return null;
    const b = g();
    cache.set(n, b);
    return b;
  };
  return {
    names: () => [...files.keys()],
    text: (n) => get(n)?.toString('utf8') ?? null,
    bytes: (n) => {
      const b = get(n);
      return b ? new Uint8Array(b.buffer, b.byteOffset, b.length) : null;
    },
    // one level of embedding (a spreadsheet inside a report); not a spreadsheet inside that
    ...(depth < 1
      ? {
          open: (n: string) => {
            const b = get(n);
            return b ? partsOf(b, budget, depth + 1) : null;
          },
        }
      : {}),
  };
}

const IMAGE_MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };

export interface DocRead {
  doc: SourceDoc;
  media: MediaRef[];
  /** milliseconds spent reading */
  ms: number;
}

/**
 * One file into a checked SourceDoc. Throws with a reason a person can read
 * when the file cannot be read at all; anything read in part says so in its
 * checks.
 */
export async function readDocument(
  name: string,
  buf: Buffer,
  opts: { maxPages?: number; budgetMs?: number; media?: { count: number; bytes: number; total: number } } = {}
): Promise<DocRead> {
  const started = Date.now();
  const id = docIdOf(buf);
  const ext = extensionOf(name);
  let out: ReaderOut;
  let overprints = 0;
  let pkg: OfficeParts | null = null;
  const office = (b: Buffer) => (pkg = partsOf(b));
  if (ext === 'pdf') {
    const r = await readPdf(new Uint8Array(buf.buffer, buf.byteOffset, buf.length), { id, name, ...(opts.maxPages ? { maxPages: opts.maxPages } : {}), ...(opts.budgetMs ? { budgetMs: opts.budgetMs } : {}) });
    out = { doc: r.doc, raw: r.raw, notes: [], media: [] };
    overprints = r.overprints;
    if (!r.doc.blocks.length && !r.doc.pages.some((p) => p.ocr === 'needed')) throw new Error(r.doc.pageCount ? 'no text could be read from it' : 'it has no pages');
  } else if (ext === 'docx' || ext === 'docm' || ext === 'dotx') out = readDocx(office(buf), { id, name });
  else if (ext === 'xlsx' || ext === 'xlsm') out = readXlsx(office(buf), { id, name });
  else if (ext === 'pptx' || ext === 'ppsx' || ext === 'pptm') out = readPptx(office(buf), { id, name });
  else if (ext === 'odt' || ext === 'odp' || ext === 'ods') out = readOdf(office(buf), { id, name, format: ext });
  else if (ext === 'rtf') out = readRtf(buf.toString('latin1'), { id, name });
  else if ((IMAGE_EXTENSIONS as readonly string[]).includes(ext)) {
    // a photograph, a scan, a screenshot: one page for the vision reading
    const doc = new DocBuilder('vision').build({ id, name, format: 'image', pageCount: 1, scans: new Set([1]) });
    out = { doc, raw: [], notes: [], media: [{ figure: '', page: 1, part: '', mime: IMAGE_MIME[ext] ?? 'image/png', dataUrl: `data:${IMAGE_MIME[ext] ?? 'image/png'};base64,${buf.toString('base64')}` }] };
  } else out = readPlain(name, buf.toString('utf8'), { id });

  // what crossed into the document is held to the document's limits; if that cut anything, it is said
  const clean = sanitizeSourceDoc(out.doc);
  if (!clean) throw new Error('it could not be read');
  const notes: DocCheck[] = [...out.notes];
  const cut = out.doc.blocks.length - clean.blocks.length;
  if (cut > 0) notes.push({ id: 'unread', level: 'warn', says: `The reading was longer than one document holds: its last ${cut} passage${cut === 1 ? ' was' : 's were'} left out.` });
  clean.checks = checkDoc(clean, out.raw, { overprints, notes });
  clean.readAt = Date.now();
  // the pictures inside an Office file, handed back (within limits) so a vision reading can be asked for in the browser
  let media = out.media;
  if (opts.media && pkg) {
    const parts: OfficeParts = pkg;
    let total = 0;
    media = out.media.slice(0, opts.media.count).flatMap((m) => {
      if (m.dataUrl) return [m];
      const bytes = parts.bytes(m.part);
      if (!bytes || bytes.length > opts.media!.bytes || total + bytes.length > opts.media!.total) return [];
      total += bytes.length;
      return [{ ...m, dataUrl: `data:${m.mime};base64,${Buffer.from(bytes).toString('base64')}` }];
    });
  } else if (!opts.media) {
    // not asked for: pictures stay where they are (the browser that sent the file has them)
    media = out.media.map(({ dataUrl: _d, ...m }) => m);
  }
  return { doc: clean, media, ms: Date.now() - started };
}
